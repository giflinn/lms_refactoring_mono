// One-off ops script (2026-06-22): issue a TRTYPE=14 refund for a single card
// order to satisfy BCC's go-live test case. BCC confirmed in chat they want the
// refund via TRTYPE=14 and that it may be done the same day as the purchase.
// The normal path (src/services/bcc/refund.ts) auto-picks TRTYPE=22 for a
// same-day reversal, so this script forces TRTYPE=14 for one specified order.
// It reuses the tested refund() BCC call + changeOrderPaymentStatus() so the
// gateway op and the DB side-effects exactly match the real admin "Возврат".
//
// Run (on the server, from web/backend):
//   tsx --env-file=.env scripts/bcc-refund-trtype14.ts <orderNumber>

import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { orders, paymentTransactions } from "../src/db/schema";
import { isSuccess, refund as bccRefund } from "../src/services/bcc/client";
import { logBccEvent } from "../src/services/bcc/events";
import { changeOrderPaymentStatus } from "../src/services/orderStatus";

async function main(): Promise<void> {
  const orderNumber = Number(process.argv[2]);
  if (!Number.isInteger(orderNumber)) {
    console.error("usage: bcc-refund-trtype14 <orderNumber>");
    process.exit(1);
  }

  const [order] = await db
    .select({
      id: orders.id,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order) {
    console.error(`order ${orderNumber} not found`);
    process.exit(1);
  }
  if (order.paymentMethod !== "card") {
    console.error(`order ${orderNumber} is not a card order`);
    process.exit(1);
  }

  const [tx] = await db
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.orderId, order.id),
        eq(paymentTransactions.status, "paid"),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);
  if (!tx) {
    console.error(`order ${orderNumber} has no captured (paid) transaction`);
    process.exit(1);
  }
  if (!tx.rrn || !tx.intRef) {
    console.error("transaction is missing rrn/int_ref — cannot refund");
    process.exit(1);
  }

  console.log(
    `[force14] order ${orderNumber} tx bccOrder=${tx.bccOrder} amount=${tx.amountTenge} rrn=${tx.rrn} → TRTYPE=14 ...`,
  );
  const result = await bccRefund({
    bccOrder: String(tx.bccOrder),
    amount: tx.amountTenge,
    rrn: tx.rrn,
    intRef: tx.intRef,
    trtype: "14",
  });
  console.log(
    "[force14] BCC result:",
    JSON.stringify({
      action: result.action,
      rc: result.rc,
      rcText: result.rcText,
      httpStatus: result.httpStatus,
    }),
  );

  if (!isSuccess(result)) {
    await logBccEvent({
      kind: "refund",
      trtype: "14",
      outcome: "declined",
      paymentTransactionId: tx.id,
      orderId: order.id,
      bccOrder: tx.bccOrder,
      action: result.action,
      rc: result.rc,
      rcText: result.rcText,
      httpStatus: result.httpStatus,
      note: "forced TRTYPE=14 (ops script) declined",
      payload: result.raw,
    });
    console.error(
      `[force14] REFUND FAILED: ACTION=${result.action} RC=${result.rc} ${result.rcText}`,
    );
    process.exit(2);
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
    orderId: order.id,
    bccOrder: tx.bccOrder,
    action: result.action,
    rc: result.rc,
    rcText: result.rcText,
    httpStatus: result.httpStatus,
    note: "forced TRTYPE=14 (ops script) approved",
    payload: result.raw,
  });
  await changeOrderPaymentStatus(order.id, "refunded", null);

  console.log(
    `[force14] OK: order ${orderNumber} refunded via TRTYPE=14 (RC=00).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[force14] fatal:", err);
  process.exit(1);
});
