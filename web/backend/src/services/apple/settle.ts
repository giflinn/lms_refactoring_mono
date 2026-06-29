// Settle an order from a verified Apple In-App Purchase, exactly once. Mirrors
// services/bcc/settle.ts: the order side reuses changeOrderPaymentStatus (the
// single chokepoint that stamps firstPaidAt, computes expiry, cascades
// fulfillment 'new'->'active', and grants Telegram/LMS access). See
// docs/ios-appstore-compliance-tz.md.

import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { appleIapTransactions, orders } from "../../db/schema";
import {
  changeOrderFulfillmentStatus,
  changeOrderPaymentStatus,
} from "../orderStatus";
import { AppleIapError } from "./appStoreServer";
import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";

// Mark an order paid from a verified transaction. Safe to call repeatedly:
//   - a refunded/revoked transaction never grants access (the App Store Server
//     API returns the live state, so this also closes the refund-before-verify
//     race — a later verify of a refunded purchase won't grant);
//   - the unique transaction_id pins one transaction to exactly one order (a
//     transaction already used for a DIFFERENT order is rejected);
//   - re-driving the SAME order is idempotent (changeOrderPaymentStatus no-ops
//     when already 'paid'), which also recovers a partially-applied settle.
export async function settleAppleIapPaid(
  orderId: string,
  tx: JWSTransactionDecodedPayload,
): Promise<void> {
  if (!tx.transactionId || !tx.productId) {
    throw new AppleIapError("apple_tx_invalid");
  }
  // revocationDate is set once Apple refunds/revokes the purchase. Never grant
  // access for a revoked transaction.
  if (tx.revocationDate != null) {
    throw new AppleIapError("apple_tx_revoked");
  }

  const inserted = await db
    .insert(appleIapTransactions)
    .values({
      orderId,
      transactionId: tx.transactionId,
      originalTransactionId: tx.originalTransactionId ?? null,
      productId: tx.productId,
      environment: String(tx.environment ?? ""),
      status: "paid",
      rawTransaction: tx as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: appleIapTransactions.transactionId })
    .returning({ id: appleIapTransactions.id });

  if (inserted.length === 0) {
    // The transaction already exists. Reject if it belongs to a different order
    // (one Apple transaction settles exactly one order); otherwise fall through
    // and re-drive THIS order to 'paid' to recover a partially-applied settle.
    const [existing] = await db
      .select({ orderId: appleIapTransactions.orderId })
      .from(appleIapTransactions)
      .where(eq(appleIapTransactions.transactionId, tx.transactionId))
      .limit(1);
    if (existing && existing.orderId !== orderId) {
      throw new AppleIapError("apple_tx_already_used");
    }
  }

  await db
    .update(orders)
    .set({ paymentMethod: "apple_iap", updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  // Idempotent: no-op when the order is already 'paid'; recovers it if a prior
  // attempt inserted the transaction row but failed before settling.
  await changeOrderPaymentStatus(orderId, "paid", null);
}

// Apply an Apple-initiated REFUND/REVOKE (from an App Store Server Notification)
// to the order behind a transaction. The money is gone via Apple, so we both
// flag the order 'refunded' AND cancel fulfillment to revoke access (Telegram
// kick via the fulfillment cascade; LMS access is derived from payment='paid'
// so it drops automatically). Idempotent on the transaction row's status.
export async function applyAppleRefund(transactionId: string): Promise<void> {
  const [row] = await db
    .update(appleIapTransactions)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(
      and(
        eq(appleIapTransactions.transactionId, transactionId),
        ne(appleIapTransactions.status, "refunded"),
      ),
    )
    .returning({ orderId: appleIapTransactions.orderId });
  if (!row) {
    // No matching transaction yet (e.g. a refund notification that arrived
    // before the purchase was ever verified, so no order was granted) or it was
    // already refunded. Nothing to revoke — verify is authoritative and won't
    // grant a revoked transaction (revocationDate guard above). Log for audit.
    console.warn(
      "[apple] refund notification: no un-refunded transaction matched",
      transactionId,
    );
    return;
  }

  await changeOrderPaymentStatus(row.orderId, "refunded", null);
  // changeOrderPaymentStatus only auto-cancels fulfillment when it was still
  // 'new'; an already-'active' order needs an explicit cancel to revoke access.
  // Idempotent (no-op if already cancelled). Silent — the refund push already
  // informed the client.
  await changeOrderFulfillmentStatus(row.orderId, "cancelled", null, {
    silent: true,
  });
}
