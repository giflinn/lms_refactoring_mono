// Refund a card order's captured payment via BCC (TRTYPE=14, full amount).
// Updates the payment_transactions row to 'refunded' on success. Does NOT flip
// orders.payment_status — the caller drives that via changeOrderPaymentStatus
// (so the existing status side-effects + the order_status_log entry happen
// through the one chokepoint). docs/bcc-payment-integration.md §8.

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { orders, paymentTransactions } from "../../db/schema";
import { isSuccess, refund as bccRefund } from "./client";
import { logBccEvent } from "./events";

export type RefundOutcome =
  | { outcome: "refunded" }
  | { outcome: "not_card" } // non-card order, or nothing captured → caller flips status manually
  | { outcome: "error"; errorCode: string };

export async function refundCardOrder(orderId: string): Promise<RefundOutcome> {
  const [order] = await db
    .select({ method: orders.paymentMethod })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.method !== "card") return { outcome: "not_card" };

  const [tx] = await db
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.orderId, orderId),
        eq(paymentTransactions.status, "paid"),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);
  if (!tx) return { outcome: "not_card" }; // card order but nothing captured
  // Same-day → void (TRTYPE=22, before the batch settles); an earlier Almaty
  // day → refund (TRTYPE=14, ≤30d). A same-day TRTYPE=14 returns RC=95
  // "Reconcile error". Cut-off is the bank's local day; exact batch time TBC
  // with BCC. docs/bcc-payment-integration.md §6.4.
  const trtype: "14" | "22" = isSameAlmatyDay(tx.createdAt, new Date())
    ? "22"
    : "14";
  if (!tx.rrn || !tx.intRef) {
    await logBccEvent({
      kind: "refund",
      trtype,
      outcome: "error",
      paymentTransactionId: tx.id,
      orderId,
      bccOrder: tx.bccOrder,
      note: "missing rrn/int_ref — cannot refund",
    });
    return { outcome: "error", errorCode: "refund_missing_reference" };
  }

  let result;
  try {
    result = await bccRefund({
      bccOrder: String(tx.bccOrder),
      amount: tx.amountTenge,
      rrn: tx.rrn,
      intRef: tx.intRef,
      trtype,
    });
  } catch (err) {
    console.error("[bcc] refund call failed:", err);
    await logBccEvent({
      kind: "refund",
      trtype,
      outcome: "error",
      paymentTransactionId: tx.id,
      orderId,
      bccOrder: tx.bccOrder,
      note: `refund request threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { outcome: "error", errorCode: "refund_failed" };
  }
  if (!isSuccess(result)) {
    console.warn(
      "[bcc] refund declined",
      tx.bccOrder,
      result.action,
      result.rc,
      result.rcText,
    );
    await logBccEvent({
      kind: "refund",
      trtype,
      outcome: "declined",
      paymentTransactionId: tx.id,
      orderId,
      bccOrder: tx.bccOrder,
      action: result.action,
      rc: result.rc,
      rcText: result.rcText,
      httpStatus: result.httpStatus,
      note: "refund declined by bank",
      payload: result.raw,
    });
    return { outcome: "error", errorCode: "refund_failed" };
  }

  await db
    .update(paymentTransactions)
    .set({
      status: "refunded",
      action: result.action,
      rc: result.rc,
      rcText: result.rcText,
      rawCallback: result.raw,
      updatedAt: new Date(),
    })
    .where(eq(paymentTransactions.id, tx.id));
  await logBccEvent({
    kind: "refund",
    trtype: "14",
    outcome: "success",
    paymentTransactionId: tx.id,
    orderId,
    bccOrder: tx.bccOrder,
    action: result.action,
    rc: result.rc,
    rcText: result.rcText,
    httpStatus: result.httpStatus,
    payload: result.raw,
  });
  return { outcome: "refunded" };
}

// BCC reconciles by the bank's local day (Almaty, UTC+5, no DST). Same calendar
// day in that zone = not yet settled → void; otherwise = settled → refund.
function isSameAlmatyDay(a: Date, b: Date): boolean {
  const offset = 5 * 60 * 60 * 1000;
  const da = new Date(a.getTime() + offset);
  const db = new Date(b.getTime() + offset);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}
