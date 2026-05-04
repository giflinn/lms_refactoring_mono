// Hourly sweep: any 'new' order older than 24h is auto-flipped to 'unpaid'.
// Goes through changeOrderStatus so the same audit log + push path fires
// (push channel "default", title "Заказ №X — оплата не получена"). Single
// pm2 host, in-process scheduler — same model as notificationDispatcher.

import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { orders } from "../db/schema";
import { changeOrderStatus } from "./orderStatus";

const TICK_MS = 60 * 60 * 1000; // 1 hour
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startOrderStaleCron(): void {
  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}

async function tick(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, "new"), lt(orders.createdAt, cutoff)));

    for (const o of stale) {
      try {
        // changedByUserId=null marks this as a system action in the log.
        await changeOrderStatus(o.id, "unpaid", null);
      } catch (err) {
        console.error("[orders-cron] sweep failed for", o.id, err);
      }
    }
  } catch (err) {
    console.error("[orders-cron] tick failed:", err);
  }
}
