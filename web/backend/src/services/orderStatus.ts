// Order status transitions and the cascade onto coach_bookings.
//
// Side-effects per transition:
//   X       → cancelled  : mark order's active coach_bookings as cancelled
//   cancelled → Y         : try to re-activate the order's cancelled bookings
//                           (refuse with 409 booking_conflict on overlap unless
//                           force=true is passed)
//   anything else         : no booking change
//
// Push to client on every transition EXCEPT 'new' (creation is silent;
// status moves are notifications).

import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  coachSlots,
  orderItems,
  orderStatusLog,
  orders,
} from "../db/schema";
import { sendPushToUser, type PushPayload } from "./push";

export type OrderStatus = "new" | "paid" | "unpaid" | "cancelled";

export class OrderStatusError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, details?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export type ChangeStatusResult = {
  status: OrderStatus;
  // True when a push was scheduled. False for new-status (silent) or no-op transitions.
  pushScheduled: boolean;
};

export async function changeOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  changedByUserId: string | null,
  options: { force?: boolean } = {},
): Promise<ChangeStatusResult> {
  // Run the DB work, capture push payload to fire AFTER commit. Doing the
  // push inside the transaction would (a) hold the FCM round-trip in the TX
  // window and (b) fire even if the commit later fails.
  const txResult = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        clientId: orders.clientId,
        status: orders.status,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new OrderStatusError("order_not_found");
    if (order.status === toStatus) {
      return { status: order.status as OrderStatus, push: null };
    }

    const fromStatus = order.status as OrderStatus;
    const goingToCancelled = toStatus === "cancelled";
    const revertingFromCancelled =
      fromStatus === "cancelled" && toStatus !== "cancelled";

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
            cancelledAt: new Date(),
            updatedAt: new Date(),
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
              updatedAt: new Date(),
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
        status: toStatus,
        statusChangedAt: new Date(),
        statusChangedByUserId: changedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    await tx.insert(orderStatusLog).values({
      orderId,
      fromStatus,
      toStatus,
      changedByUserId,
    });

    let push: { clientId: string; payload: PushPayload } | null = null;
    if (toStatus !== "new") {
      const text = pushTextFor(toStatus, order.orderNumber);
      push = {
        clientId: order.clientId,
        payload: {
          title: text.title,
          body: text.body,
          data: {
            type: "order_status",
            orderId: order.id,
            status: toStatus,
          },
        },
      };
    }

    return { status: toStatus, push };
  });

  if (txResult.push) {
    // Fire-and-forget after commit. Caller doesn't need to wait for FCM.
    sendPushToUser(txResult.push.clientId, txResult.push.payload).catch(
      (err) => console.error("[orders] push failed:", err),
    );
  }
  return { status: txResult.status, pushScheduled: txResult.push !== null };
}

function pushTextFor(
  status: Exclude<OrderStatus, "new">,
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
    case "cancelled":
      return {
        title: `Заказ №${orderNumber} отменён`,
        body: "Если вы не отменяли — напишите менеджеру.",
      };
  }
}
