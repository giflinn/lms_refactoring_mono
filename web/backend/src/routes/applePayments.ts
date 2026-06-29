// Apple In-App Purchase endpoints for the iOS client:
//   POST /payments/apple/verify        — client confirms a StoreKit purchase;
//                                        we verify it with Apple and settle the
//                                        order to 'paid' (grants access).
//   POST /payments/apple/notifications — App Store Server Notifications V2
//                                        webhook (no auth: the JWS signature is
//                                        the authentication). Handles REFUND /
//                                        REVOKE by revoking access.
//
// Digital goods on iOS must use IAP (App Store guideline 3.1.1); the BCC card
// flow is blocked for them in routes/payments.ts. See
// docs/ios-appstore-compliance-tz.md.

import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, products } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";
import { config } from "../config";
import {
  AppleIapError,
  verifyNotification,
  verifyTransactionById,
} from "../services/apple/appStoreServer";
import { applyAppleRefund, settleAppleIapPaid } from "../services/apple/settle";
import { OrderStatusError } from "../services/orderStatus";

export const applePaymentsRouter = Router();

const APPLE_CONFIG_ERRORS = new Set([
  "apple_iap_not_configured",
  "apple_root_certs_missing",
  "apple_app_apple_id_missing",
]);

// Maps Apple-side failures to a clean response. Config/cert problems → 503
// (server-side, transient); anything else → 400 with a stable code so the app
// can react. Never leaks internals.
function handleAppleError(err: unknown, res: Response): void {
  if (err instanceof AppleIapError) {
    if (APPLE_CONFIG_ERRORS.has(err.code)) {
      res.status(503).json({ error: "payment_unavailable" });
      return;
    }
    res.status(400).json({ error: err.code });
    return;
  }
  console.error("[apple] verify error:", err);
  res.status(400).json({ error: "apple_tx_invalid" });
}

applePaymentsRouter.post(
  "/payments/apple/verify",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      const transactionId =
        typeof body.transactionId === "string" ? body.transactionId : "";
      if (!orderId || !transactionId) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }

      // Orders are single-item (createOrderForClient enforces it), so one join
      // gives the order + its product.
      const [row] = await db
        .select({
          clientId: orders.clientId,
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
          isDigital: products.isDigital,
          iosIapProductId: products.iosIapProductId,
        })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!row || row.clientId !== actorId) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      if (!row.isDigital) {
        res.status(400).json({ error: "order_not_digital" });
        return;
      }
      if (!row.iosIapProductId) {
        res.status(400).json({ error: "product_missing_iap_id" });
        return;
      }

      // Fetch + cryptographically verify the transaction with Apple.
      const tx = await verifyTransactionById(transactionId);
      if (tx.bundleId !== config.appleIap.bundleId) {
        res.status(400).json({ error: "apple_tx_bundle_mismatch" });
        return;
      }
      if (tx.productId !== row.iosIapProductId) {
        res.status(400).json({ error: "apple_tx_product_mismatch" });
        return;
      }

      // Idempotent: replays no-op on the unique transaction_id / paid order.
      await settleAppleIapPaid(orderId, tx);

      const [updated] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      res.json({
        ok: true,
        paymentStatus: updated?.paymentStatus,
        fulfillmentStatus: updated?.fulfillmentStatus,
      });
    } catch (err) {
      if (err instanceof OrderStatusError) {
        res.status(409).json({ error: err.code });
        return;
      }
      handleAppleError(err, res);
    }
  },
);

applePaymentsRouter.post(
  "/payments/apple/notifications",
  async (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const signedPayload =
      typeof body.signedPayload === "string" ? body.signedPayload : "";
    if (!signedPayload) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    // Verify the JWS first — this is the authentication. A failure (forged call
    // or missing Apple config) returns non-2xx so Apple retries; we never act
    // on an unverified payload.
    let notification;
    try {
      notification = await verifyNotification(signedPayload);
    } catch (err) {
      console.error("[apple] notification verify failed:", err);
      res.status(401).json({ error: "invalid_notification" });
      return;
    }

    try {
      const type = notification.notificationType;
      if (
        (type === "REFUND" || type === "REVOKE") &&
        notification.transaction?.transactionId
      ) {
        await applyAppleRefund(notification.transaction.transactionId);
      }
      // 200 for any verified notification (including unhandled types) so Apple
      // stops retrying.
      res.status(200).json({ ok: true });
    } catch (err) {
      // Verified but processing failed (e.g. a DB hiccup). Non-2xx → Apple
      // retries; applyAppleRefund is idempotent, so a retry is safe.
      next(err);
    }
  },
);
