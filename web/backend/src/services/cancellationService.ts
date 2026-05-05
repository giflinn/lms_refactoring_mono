import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  orderCancellations,
  orderItems,
  orders,
  products,
} from "../db/schema";
import { sendPushToUser } from "./push";
import {
  changeOrderFulfillmentStatus,
  OrderStatusError,
} from "./orderStatus";

export type CancellationStatus = "requested" | "approved" | "rejected";

export class CancellationError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, details?: unknown) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

// Used by the mobile flow: client confirms cancel in the dialog → POST creates
// the request after eligibility checks. Snapshots managerId from the order so
// reassigning the client's manager later does not move the request.
//
// Eligibility rules (matches what the mobile UI already gates on):
//   - order belongs to the calling client
//   - fulfillment_status === 'active' (new isn't paid yet, completed/cancelled
//     are terminal)
//   - cancellation window still open: firstPaidAt + min(daysUntilCancel) > now
//   - no existing 'requested' cancellation for this order (DB-enforced too)
export async function createCancellationForClient(input: {
  clientId: string;
  orderId: string;
  clientReason: string | null;
}): Promise<{ id: string; managerId: string | null; orderNumber: number }> {
  const { clientId, orderId, clientReason } = input;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        clientId: orders.clientId,
        managerId: orders.managerId,
        fulfillmentStatus: orders.fulfillmentStatus,
        firstPaidAt: orders.firstPaidAt,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) throw new CancellationError("order_not_found");
    if (order.clientId !== clientId) {
      throw new CancellationError("forbidden");
    }
    if (order.fulfillmentStatus !== "active") {
      throw new CancellationError("order_not_cancellable");
    }
    if (!order.firstPaidAt) {
      throw new CancellationError("order_not_cancellable");
    }

    const itemRows = await tx
      .select({ daysUntilCancel: products.daysUntilCancel })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, orderId));
    if (itemRows.length === 0) {
      throw new CancellationError("order_not_cancellable");
    }
    const minDays = Math.min(...itemRows.map((it) => it.daysUntilCancel));
    const deadline = order.firstPaidAt.getTime() + minDays * 86_400_000;
    if (Date.now() > deadline) {
      throw new CancellationError("cancellation_window_closed");
    }

    try {
      const [inserted] = await tx
        .insert(orderCancellations)
        .values({
          orderId,
          clientId,
          managerId: order.managerId,
          clientReason: clientReason && clientReason.trim() ? clientReason.trim() : null,
        })
        .returning({ id: orderCancellations.id });
      return {
        id: inserted.id,
        managerId: order.managerId,
        orderNumber: order.orderNumber,
      };
    } catch (err) {
      // Partial unique index "order_cancellations_one_open_per_order" trips
      // when there's already a 'requested' row.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new CancellationError("cancellation_already_pending");
      }
      throw err;
    }
  });

  // Best-effort push to the assigned manager. If managerId is null (rare
  // edge case before any staff assignment), the request still lives in the
  // admin list — staff just won't get a push.
  if (result.managerId) {
    sendPushToUser(result.managerId, {
      title: `Запрос на отмену заказа №${result.orderNumber}`,
      body: clientReason && clientReason.trim()
        ? clientReason.trim()
        : "Откройте админку, чтобы рассмотреть запрос.",
      data: {
        type: "cancellation_requested",
        cancellationId: result.id,
        orderId,
      },
    }).catch((err) =>
      console.error("[cancellations] manager push failed:", err),
    );
  }

  return result;
}

// Staff decision. manager-role callers are scoped to their own orders by the
// route layer; this service trusts actorId/actorRole to be authorized.
//
// On 'approved' we cascade to fulfillment_status='cancelled' via the existing
// path so coach_bookings get cancelled; we suppress its push because we send
// our own approval push from here (avoids double-pinging the client).
export async function decideCancellation(input: {
  cancellationId: string;
  actorId: string;
  decision: "approved" | "rejected";
  decisionComment: string | null;
}): Promise<{ id: string }> {
  const { cancellationId, actorId, decision, decisionComment } = input;

  const txResult = await db.transaction(async (tx) => {
    // SELECT … FOR UPDATE so two concurrent decisions can't both succeed.
    const [row] = await tx
      .select({
        id: orderCancellations.id,
        status: orderCancellations.status,
        orderId: orderCancellations.orderId,
        clientId: orderCancellations.clientId,
      })
      .from(orderCancellations)
      .where(eq(orderCancellations.id, cancellationId))
      .for("update")
      .limit(1);

    if (!row) throw new CancellationError("cancellation_not_found");
    if (row.status !== "requested") {
      throw new CancellationError("cancellation_already_decided");
    }

    const [order] = await tx
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, row.orderId))
      .limit(1);
    if (!order) throw new CancellationError("order_not_found");

    const now = new Date();
    await tx
      .update(orderCancellations)
      .set({
        status: decision,
        decisionComment:
          decisionComment && decisionComment.trim()
            ? decisionComment.trim()
            : null,
        decidedAt: now,
        decidedByUserId: actorId,
        updatedAt: now,
      })
      .where(eq(orderCancellations.id, cancellationId));

    return {
      id: row.id,
      orderId: row.orderId,
      clientId: row.clientId,
      orderNumber: order.orderNumber,
    };
  });

  if (decision === "approved") {
    try {
      await changeOrderFulfillmentStatus(
        txResult.orderId,
        "cancelled",
        actorId,
        { silent: true },
      );
    } catch (err) {
      // booking_conflict shouldn't fire here — moving TO cancelled cascades
      // bookings to cancelled, no overlap check. Surface anything unexpected.
      if (err instanceof OrderStatusError) {
        throw new CancellationError(err.code, err.details);
      }
      throw err;
    }
  }

  const pushPayload =
    decision === "approved"
      ? {
          title: `Запрос на отмену одобрен`,
          body: `Заказ №${txResult.orderNumber} отменён.`,
        }
      : {
          title: `Запрос на отмену отклонён`,
          body: `По заказу №${txResult.orderNumber}: свяжитесь с менеджером.`,
        };

  sendPushToUser(txResult.clientId, {
    ...pushPayload,
    data: {
      type: "cancellation_decided",
      cancellationId: txResult.id,
      orderId: txResult.orderId,
      decision,
    },
  }).catch((err) =>
    console.error("[cancellations] client push failed:", err),
  );

  return { id: txResult.id };
}

// Lightweight lookup the /me/orders endpoint uses to surface
// `pendingCancellation` on each order so the mobile app knows whether to
// disable the "Отменить заказ" button. Returns a Map keyed by orderId.
export async function pendingCancellationsByOrderId(
  orderIds: readonly string[],
): Promise<Map<string, { id: string; createdAt: Date }>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: orderCancellations.id,
      orderId: orderCancellations.orderId,
      createdAt: orderCancellations.createdAt,
    })
    .from(orderCancellations)
    .where(
      and(
        eq(orderCancellations.status, "requested"),
        sql`${orderCancellations.orderId} = ANY(${orderIds})`,
      ),
    )
    .orderBy(asc(orderCancellations.createdAt));
  const out = new Map<string, { id: string; createdAt: Date }>();
  for (const r of rows) {
    // partial unique index keeps it 1:1, but be defensive against stale state.
    if (!out.has(r.orderId)) {
      out.set(r.orderId, { id: r.id, createdAt: r.createdAt });
    }
  }
  return out;
}

