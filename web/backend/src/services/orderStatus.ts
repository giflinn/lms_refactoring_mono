// Two orthogonal status axes — payment and fulfillment — with their own
// transition handlers. Splitting them keeps each side of state machine
// small and avoids the "is 'cancelled' a payment thing or a lifecycle
// thing?" ambiguity the single-enum design had.
//
// changeOrderPaymentStatus
//   - On first transition to 'paid': set firstPaidAt + compute expires_at
//     for time-bound items (perpetual stay NULL, bookable already set at
//     order creation)
//   - Logs to order_status_log
//   - Push to client on every status except 'new'
//
// changeOrderFulfillmentStatus
//   - To 'cancelled': cancels coach_bookings
//   - Reverting from 'cancelled': re-activates coach_bookings; refuses with
//     409 booking_conflict on overlap unless force=true
//   - Push on 'cancelled' (skip 'completed' to avoid spamming users — easy
//     to add later if needed)

import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  coachSlots,
  orderItems,
  orderStatusLog,
  orders,
  products,
} from "../db/schema";
import { sendPushToUser, type PushPayload } from "./push";
import {
  grantTelegramAccessForOrder,
  revokeTelegramAccessForOrder,
} from "./telegram/grants";

export type PaymentStatus = "pending" | "paid" | "unpaid" | "refunded";
export type FulfillmentStatus =
  | "new"
  | "active"
  | "completed"
  | "cancelled";

export class OrderStatusError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, details?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export type ChangeStatusResult<S> = {
  status: S;
  pushScheduled: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function changeOrderPaymentStatus(
  orderId: string,
  toStatus: PaymentStatus,
  changedByUserId: string | null,
): Promise<ChangeStatusResult<PaymentStatus>> {
  const txResult = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        clientId: orders.clientId,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        firstPaidAt: orders.firstPaidAt,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new OrderStatusError("order_not_found");
    if (order.paymentStatus === toStatus) {
      return {
        status: order.paymentStatus as PaymentStatus,
        push: null,
        autoFulfillmentTarget: null as FulfillmentStatus | null,
      };
    }

    // Once refunded (money returned to the client — by a BCC refund or a
    // manual flip), block re-flagging as 'paid': that would re-grant access
    // for money we no longer hold. Reactivating fulfillment is blocked
    // symmetrically in changeOrderFulfillmentStatus.
    if (order.paymentStatus === "refunded" && toStatus === "paid") {
      throw new OrderStatusError("order_refunded");
    }

    const fromStatus = order.paymentStatus as PaymentStatus;
    const isFirstPaid = toStatus === "paid" && order.firstPaidAt === null;
    const now = new Date();

    // First-paid transition: stamp firstPaidAt and compute expires_at for
    // time-bound items whose expires_at is still NULL.
    if (isFirstPaid) {
      const items = await tx
        .select({
          id: orderItems.id,
          expiresAt: orderItems.expiresAt,
          activeDurationDays: products.activeDurationDays,
        })
        .from(orderItems)
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        if (item.expiresAt !== null) continue; // bookable already set
        if (item.activeDurationDays === null) continue; // perpetual stays NULL
        const expiresAt = new Date(
          now.getTime() + item.activeDurationDays * DAY_MS,
        );
        await tx
          .update(orderItems)
          .set({ expiresAt })
          .where(eq(orderItems.id, item.id));
      }
    }

    await tx
      .update(orders)
      .set({
        paymentStatus: toStatus,
        statusChangedAt: now,
        statusChangedByUserId: changedByUserId,
        updatedAt: now,
        ...(isFirstPaid ? { firstPaidAt: now } : {}),
      })
      .where(eq(orders.id, orderId));

    await tx.insert(orderStatusLog).values({
      orderId,
      fromStatus,
      toStatus,
      changedByUserId,
    });

    // Auto-transition fulfillment out of 'new' when payment leaves 'pending'.
    // 'paid' wakes the lifecycle into 'active'; 'unpaid'/'refunded' kill it
    // outright into 'cancelled'. Once fulfillment is past 'new' it stays
    // decoupled — staff drives changes manually from the drawer.
    let autoFulfillmentTarget: FulfillmentStatus | null = null;
    if (
      order.fulfillmentStatus === "new" &&
      fromStatus === "pending" &&
      toStatus !== "pending"
    ) {
      autoFulfillmentTarget = toStatus === "paid" ? "active" : "cancelled";
    }

    let push: { clientId: string; payload: PushPayload } | null = null;
    if (toStatus !== "pending") {
      const text = paymentPushText(toStatus, order.orderNumber);
      push = {
        clientId: order.clientId,
        payload: {
          title: text.title,
          body: text.body,
          data: {
            type: "order_payment_status",
            orderId: order.id,
            paymentStatus: toStatus,
          },
        },
      };
    }

    return { status: toStatus, push, autoFulfillmentTarget };
  });

  // Run fulfillment cascade after the payment txn commits — it has its own
  // transaction (cancels coach_bookings) and we suppress its push because the
  // payment push already informed the client.
  if (txResult.autoFulfillmentTarget) {
    await changeOrderFulfillmentStatus(
      orderId,
      txResult.autoFulfillmentTarget,
      changedByUserId,
      { silent: true },
    );
  }

  if (txResult.push) {
    sendPushToUser(txResult.push.clientId, txResult.push.payload).catch(
      (err) => console.error("[orders] payment push failed:", err),
    );
  }
  return {
    status: txResult.status,
    pushScheduled: txResult.push !== null,
  };
}

export async function changeOrderFulfillmentStatus(
  orderId: string,
  toStatus: FulfillmentStatus,
  changedByUserId: string | null,
  options: { force?: boolean; silent?: boolean } = {},
): Promise<ChangeStatusResult<FulfillmentStatus>> {
  const txResult = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        clientId: orders.clientId,
        fulfillmentStatus: orders.fulfillmentStatus,
        paymentStatus: orders.paymentStatus,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new OrderStatusError("order_not_found");
    if (order.fulfillmentStatus === toStatus) {
      return {
        status: order.fulfillmentStatus as FulfillmentStatus,
        push: null,
      };
    }

    // A refunded order can't be re-activated — the money's been returned.
    // Mirrors the refunded→paid block in changeOrderPaymentStatus.
    if (toStatus === "active" && order.paymentStatus === "refunded") {
      throw new OrderStatusError("order_refunded");
    }

    const fromStatus = order.fulfillmentStatus as FulfillmentStatus;
    const goingToCancelled = toStatus === "cancelled";
    const revertingFromCancelled =
      fromStatus === "cancelled" && toStatus !== "cancelled";
    const now = new Date();

    if (goingToCancelled) {
      const items = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const itemIds = items.map((i) => i.id);
      if (itemIds.length > 0) {
        await tx
          .update(coachBookings)
          .set({
            status: "cancelled",
            cancelledAt: now,
            updatedAt: now,
          })
          .where(
            and(
              inArray(coachBookings.orderItemId, itemIds),
              eq(coachBookings.status, "active"),
            ),
          );
      }
    }

    if (revertingFromCancelled) {
      const items = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const itemIds = items.map((i) => i.id);
      if (itemIds.length > 0) {
        const cancelled = await tx
          .select({
            id: coachBookings.id,
            slotId: coachBookings.coachSlotId,
            startsAt: coachBookings.startsAt,
            endsAt: coachBookings.endsAt,
          })
          .from(coachBookings)
          .where(
            and(
              inArray(coachBookings.orderItemId, itemIds),
              eq(coachBookings.status, "cancelled"),
            ),
          );

        const conflicts: Array<{ bookingId: string; reason: string }> = [];
        for (const b of cancelled) {
          const [slot] = await tx
            .select({ status: coachSlots.status })
            .from(coachSlots)
            .where(eq(coachSlots.id, b.slotId))
            .limit(1);
          if (!slot || slot.status !== "active") {
            conflicts.push({ bookingId: b.id, reason: "slot_cancelled" });
            continue;
          }
          const overlap = await tx
            .select({ id: coachBookings.id })
            .from(coachBookings)
            .where(
              and(
                eq(coachBookings.coachSlotId, b.slotId),
                eq(coachBookings.status, "active"),
                lt(coachBookings.startsAt, b.endsAt),
                gt(coachBookings.endsAt, b.startsAt),
                ne(coachBookings.id, b.id),
              ),
            )
            .limit(1);
          if (overlap.length > 0) {
            conflicts.push({ bookingId: b.id, reason: "overlap" });
          }
        }

        if (conflicts.length > 0 && !options.force) {
          throw new OrderStatusError("booking_conflict", { conflicts });
        }
        const conflictedIds = new Set(conflicts.map((c) => c.bookingId));
        const reactivatable = cancelled.filter(
          (b) => !conflictedIds.has(b.id),
        );
        if (reactivatable.length > 0) {
          await tx
            .update(coachBookings)
            .set({
              status: "active",
              cancelledAt: null,
              updatedAt: now,
            })
            .where(
              inArray(
                coachBookings.id,
                reactivatable.map((b) => b.id),
              ),
            );
        }
      }
    }

    await tx
      .update(orders)
      .set({
        fulfillmentStatus: toStatus,
        statusChangedAt: now,
        statusChangedByUserId: changedByUserId,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));

    let push: { clientId: string; payload: PushPayload } | null = null;
    if (toStatus === "cancelled" && !options.silent) {
      push = {
        clientId: order.clientId,
        payload: {
          title: `Заказ №${order.orderNumber} отменён`,
          body: "Если вы не отменяли — напишите менеджеру.",
          data: {
            type: "order_fulfillment_status",
            orderId: order.id,
            fulfillmentStatus: toStatus,
          },
        },
      };
    }

    return { status: toStatus, push, fromStatus, toStatus };
  });

  if (txResult.push) {
    sendPushToUser(txResult.push.clientId, txResult.push.payload).catch(
      (err) => console.error("[orders] fulfillment push failed:", err),
    );
  }

  // Telegram grants/revokes piggyback on the fulfillment lifecycle:
  //   * → active     → grant (idempotent; stays no-op if already granted)
  //   * → cancelled  → revoke (kicks if no other active grant survives)
  //   * → completed  → revoke (item lifecycle ended naturally)
  // Errors are swallowed inside the grant/revoke services — they have their
  // own DB state to retry from on the next status flip.
  if (txResult.fromStatus !== txResult.toStatus) {
    if (txResult.toStatus === "active") {
      grantTelegramAccessForOrder(orderId).catch((err) =>
        console.error("[telegram] grantForOrder failed:", err),
      );
    } else if (
      txResult.toStatus === "cancelled" ||
      txResult.toStatus === "completed"
    ) {
      revokeTelegramAccessForOrder(orderId).catch((err) =>
        console.error("[telegram] revokeForOrder failed:", err),
      );
    }
  }

  return {
    status: txResult.status,
    pushScheduled: txResult.push !== null,
  };
}

function paymentPushText(
  status: Exclude<PaymentStatus, "pending">,
  orderNumber: number,
): { title: string; body: string } {
  switch (status) {
    case "paid":
      return {
        title: `Заказ №${orderNumber} оплачен`,
        body: "Спасибо! Оплата получена.",
      };
    case "unpaid":
      return {
        title: `Заказ №${orderNumber} — оплата не получена`,
        body: "Свяжитесь с менеджером, если уже оплатили.",
      };
    case "refunded":
      return {
        title: `Заказ №${orderNumber} — возврат`,
        body: "Деньги по заказу возвращены.",
      };
  }
}
