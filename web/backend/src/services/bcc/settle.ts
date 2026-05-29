// Settle a BCC payment as paid, exactly once. Shared by the callback and the
// TRTYPE=90 re-check so a lost-then-recovered notification can't double-apply.
//
// Idempotency: the UPDATE is guarded on status != 'paid', so only the first
// caller flips the row and drives the order. Concurrent/duplicate calls match
// zero rows and no-op. The order side reuses changeOrderPaymentStatus, which
// is itself a no-op when already 'paid'. docs/bcc-payment-integration.md §8.

import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { paymentTransactions } from "../../db/schema";
import { changeOrderPaymentStatus } from "../orderStatus";
import type { BccResult } from "./client";

export async function settlePaid(
  paymentId: string,
  orderId: string,
  result: Omit<BccResult, never>,
): Promise<void> {
  const updated = await db
    .update(paymentTransactions)
    .set({
      status: "paid",
      action: result.action,
      rc: result.rc,
      rcText: result.rcText,
      rrn: result.rrn,
      intRef: result.intRef,
      cardMask: result.cardMask,
      rawCallback: result.raw,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentTransactions.id, paymentId),
        ne(paymentTransactions.status, "paid"),
      ),
    )
    .returning({ id: paymentTransactions.id });
  if (updated.length === 0) return; // already settled — idempotent no-op
  await changeOrderPaymentStatus(orderId, "paid", null);
}
