// Hourly maintenance of order lifecycle:
//   1. payment_status='new' older than 24h → 'unpaid' (with push)
//   2. fulfillment_status='active' AND payment_status='paid' AND every
//      order_item has expires_at <= now() → 'completed' (silent)
//
// Single pm2 host, in-process scheduler — same model as
// notificationDispatcher.

import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders } from "../db/schema";
import {
  changeOrderFulfillmentStatus,
  changeOrderPaymentStatus,
} from "./orderStatus";

const TICK_MS = 60 * 60 * 1000; // 1 hour
const STALE_NEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function startOrderLifecycleCron(): void {
  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}

async function tick(): Promise<void> {
  await sweepNewToUnpaid().catch((err) =>
    console.error("[orders-cron] new->unpaid sweep failed:", err),
  );
  await sweepActiveToCompleted().catch((err) =>
    console.error("[orders-cron] active->completed sweep failed:", err),
  );
}

async function sweepNewToUnpaid(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_NEW_AFTER_MS);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, "pending"),
        lt(orders.createdAt, cutoff),
      ),
    );
  for (const o of stale) {
    try {
      await changeOrderPaymentStatus(o.id, "unpaid", null);
    } catch (err) {
      console.error("[orders-cron] pending->unpaid for", o.id, err);
    }
  }
}

async function sweepActiveToCompleted(): Promise<void> {
  // Candidate orders: paid + active. Per-order check that all items have
  // expires_at set AND in the past avoids completing orders with perpetual
  // items (expires_at = NULL).
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.fulfillmentStatus, "active"),
        eq(orders.paymentStatus, "paid"),
      ),
    );

  const now = new Date();
  for (const o of candidates) {
    const items = await db
      .select({ expiresAt: orderItems.expiresAt })
      .from(orderItems)
      .where(eq(orderItems.orderId, o.id));
    if (items.length === 0) continue;
    const allExpired = items.every(
      (i) => i.expiresAt !== null && i.expiresAt <= now,
    );
    if (!allExpired) continue;
    try {
      await changeOrderFulfillmentStatus(o.id, "completed", null);
    } catch (err) {
      console.error("[orders-cron] active->completed for", o.id, err);
    }
  }
}
