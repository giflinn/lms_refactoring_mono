// Hourly maintenance of order lifecycle:
//   1. payment_status='new' older than 24h → 'unpaid' (with push)
//   2. fulfillment_status='active' AND payment_status='paid' AND every
//      order_item has expires_at <= now() → 'completed' (silent)
//
// Single pm2 host, in-process scheduler — same model as
// notificationDispatcher.

import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, paymentTransactions } from "../db/schema";
import {
  changeOrderFulfillmentStatus,
  changeOrderPaymentStatus,
} from "./orderStatus";
import { config } from "../config";
import { checkStatus, isPaid } from "./bcc/client";
import { settlePaid } from "./bcc/settle";

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
  await reconcilePendingBccPayments().catch((err) =>
    console.error("[orders-cron] bcc reconcile sweep failed:", err),
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

// 3. Reconcile pending BCC card payments younger than 24h via TRTYPE=90 —
//    covers a lost/delayed callback. Skipped entirely when BCC isn't configured
//    (dev machines) so it never hits the network there. The 24h window matches
//    BCC's status-check validity and the new→unpaid sweep that eventually
//    releases an abandoned booking. docs/bcc-payment-integration.md §8.
async function reconcilePendingBccPayments(): Promise<void> {
  if (!config.bcc.macKey) return;
  const cutoff = new Date(Date.now() - STALE_NEW_AFTER_MS);
  const pending = await db
    .select({
      id: paymentTransactions.id,
      orderId: paymentTransactions.orderId,
      bccOrder: paymentTransactions.bccOrder,
    })
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.status, "pending"),
        gt(paymentTransactions.createdAt, cutoff),
      ),
    );
  for (const p of pending) {
    try {
      const result = await checkStatus(String(p.bccOrder));
      if (isPaid(result)) await settlePaid(p.id, p.orderId, result);
    } catch (err) {
      console.error("[orders-cron] bcc reconcile for", p.id, err);
    }
  }
}
