// One-off ops script: settle a card order that was genuinely paid at BCC but
// whose notification callback we rejected (e.g. a Basic-Auth mismatch during the
// prod cutover, before BCC registered our callback creds). Reads the genuine BCC
// callback payload we logged in bcc_events and runs the normal settlePaid path,
// so the order, its references (RRN/INT_REF) and the side-effects (access, push)
// match a live callback. Idempotent (settlePaid guards on status != paid).
//
//   tsx --env-file=.env scripts/bcc-settle-once.ts <orderNumber>

import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { bccEvents, orders, paymentTransactions } from "../src/db/schema";
import { settlePaid } from "../src/services/bcc/settle";

async function main(): Promise<void> {
  const orderNumber = Number(process.argv[2]);
  if (!Number.isInteger(orderNumber)) {
    console.error("usage: bcc-settle-once <orderNumber>");
    process.exit(1);
  }

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order) {
    console.error(`order ${orderNumber} not found`);
    process.exit(1);
  }

  const [tx] = await db
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.orderId, order.id),
        eq(paymentTransactions.status, "pending"),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);
  if (!tx) {
    console.error(`order ${orderNumber} has no pending transaction (already settled?)`);
    process.exit(1);
  }

  // The genuine successful BCC callback we logged (even if we rejected it).
  const [ev] = await db
    .select({ payload: bccEvents.payload })
    .from(bccEvents)
    .where(
      and(eq(bccEvents.bccOrder, tx.bccOrder), eq(bccEvents.kind, "callback")),
    )
    .orderBy(desc(bccEvents.createdAt))
    .limit(1);
  const p = (ev?.payload ?? null) as Record<string, string> | null;
  if (!p || p.ACTION !== "0" || p.RC !== "00") {
    console.error(
      `no successful callback payload for bccOrder ${tx.bccOrder} (ACTION=${p?.ACTION} RC=${p?.RC})`,
    );
    process.exit(2);
  }

  console.log(
    `[settle-once] order ${orderNumber} bccOrder=${tx.bccOrder} rrn=${p.RRN} int_ref=${p.INT_REF} → settling paid`,
  );
  await settlePaid(tx.id, tx.orderId, {
    action: p.ACTION ?? null,
    rc: p.RC ?? null,
    rcText: p.RC_TEXT ?? null,
    rrn: p.RRN || null,
    intRef: p.INT_REF || null,
    cardMask: p.CARD_MASK || null,
    raw: p,
  });
  console.log(`[settle-once] OK: order ${orderNumber} settled paid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[settle-once] fatal:", err);
  process.exit(1);
});
