// Card payment (BCC) endpoints for the mobile client:
//   POST /payments               — start a card payment for a pending order
//   GET  /payments/:id/checkout  — auto-submit HTML the WebView loads (no auth:
//                                  a WebView navigation can't carry a bearer; the
//                                  id is an unguessable uuid and only renders
//                                  while the attempt is still pending)
//   GET  /payments/:id           — poll the current DB status (the verified
//                                  callback settles it)
//
// The authoritative "paid" signal is the BCC notification callback, never the
// browser return. See docs/bcc-payment-integration.md §5/§8.

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orders, paymentTransactions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";
import { config } from "../config";
import {
  bccNonce,
  buildPurchaseFields,
  checkoutHtml,
  requireBccConfig,
} from "../services/bcc/checkout";

export const paymentsRouter = Router();

function publicBase(): string {
  const b = config.backendPublicUrl;
  if (!b) throw new Error("bcc_backend_public_url_unset");
  return b.replace(/\/+$/, "");
}

// BCC requires NOTIFY_URL to carry an explicit port (docs §3/§14). URL
// normalization drops the default https port (443), so build the string by
// hand to keep the port.
function notifyUrl(): string {
  const u = new URL(publicBase());
  const port = u.port || "443";
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.hostname}:${port}${path}/payments/bcc/callback`;
}

function backrefUrl(): string {
  return `${publicBase()}/payments/bcc/return`;
}

// Maps internal BCC config errors to a clean 503 instead of a generic 500.
function handlePaymentError(
  err: unknown,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if (err instanceof Error && err.message.startsWith("bcc_")) {
    res.status(503).json({ error: "payment_unavailable" });
    return;
  }
  next(err);
}

paymentsRouter.post(
  "/payments",
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
      if (!orderId) {
        res.status(400).json({ error: "order_id_required" });
        return;
      }
      // Fail fast (503) if BCC isn't configured on this machine.
      requireBccConfig();
      publicBase();

      const [order] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          clientId: orders.clientId,
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
          totalTenge: orders.totalTenge,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order || order.clientId !== actorId) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      if (
        order.paymentStatus !== "pending" ||
        order.fulfillmentStatus === "cancelled"
      ) {
        res.status(409).json({ error: "order_not_payable" });
        return;
      }

      // BCC ORDER = order_number * 100 + attempt index — traceable in the BCC
      // dashboard (first digits = order number) and unique per retry (BCC
      // dedups on the low 6 digits within a day).
      const attempt = await db.$count(
        paymentTransactions,
        eq(paymentTransactions.orderId, order.id),
      );
      const [tx] = await db
        .insert(paymentTransactions)
        .values({
          orderId: order.id,
          bccOrder: order.orderNumber * 100 + attempt,
          amountTenge: order.totalTenge,
          nonce: bccNonce(),
        })
        .returning({ id: paymentTransactions.id });

      // Record the chosen method on the order (UI treats NULL as Kaspi).
      await db
        .update(orders)
        .set({ paymentMethod: "card", updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      res.json({
        paymentId: tx.id,
        checkoutUrl: `${publicBase()}/payments/${tx.id}/checkout`,
        // The WebView treats a navigation to this URL as "bank flow finished,
        // go poll status". Returned so the client matches it exactly.
        returnUrl: backrefUrl(),
      });
    } catch (err) {
      handlePaymentError(err, res, next);
    }
  },
);

paymentsRouter.get("/payments/:id/checkout", async (req, res, next) => {
  try {
    const cfg = requireBccConfig();
    const [tx] = await db
      .select({
        id: paymentTransactions.id,
        bccOrder: paymentTransactions.bccOrder,
        amountTenge: paymentTransactions.amountTenge,
        nonce: paymentTransactions.nonce,
        status: paymentTransactions.status,
        orderId: paymentTransactions.orderId,
      })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, req.params.id))
      .limit(1);
    if (!tx) {
      res.status(404).type("html").send("Платёж не найден");
      return;
    }
    if (tx.status !== "pending") {
      res.status(409).type("html").send("Платёж уже обработан");
      return;
    }

    const [order] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, tx.orderId))
      .limit(1);

    const now = new Date();
    const fields = buildPurchaseFields({
      bccOrder: String(tx.bccOrder),
      amountTenge: tx.amountTenge,
      nonce: tx.nonce,
      desc: `Оплата заказа №${order?.orderNumber ?? ""} в приложении`,
      backref: backrefUrl(),
      notifyUrl: notifyUrl(),
      now,
    });

    // Persist the exact request we signed — audit + debugging.
    await db
      .update(paymentTransactions)
      .set({ rawRequest: fields, updatedAt: now })
      .where(eq(paymentTransactions.id, tx.id));

    res.type("html").send(checkoutHtml(cfg.webviewUrl, fields));
  } catch (err) {
    handlePaymentError(err, res, next);
  }
});

paymentsRouter.get(
  "/payments/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const [row] = await db
        .select({
          id: paymentTransactions.id,
          status: paymentTransactions.status,
          rc: paymentTransactions.rc,
          rcText: paymentTransactions.rcText,
          clientId: orders.clientId,
        })
        .from(paymentTransactions)
        .innerJoin(orders, eq(orders.id, paymentTransactions.orderId))
        .where(eq(paymentTransactions.id, req.params.id))
        .limit(1);
      if (!row || row.clientId !== actorId) {
        res.status(404).json({ error: "payment_not_found" });
        return;
      }

      // The verified callback settles the order; the app polls this to reflect
      // the DB state. (No inline TRTYPE=90 — the status host returns HTML.)
      res.json({
        paymentId: row.id,
        status: row.status,
        rc: row.rc,
        rcText: row.rcText,
      });
    } catch (err) {
      handlePaymentError(err, res, next);
    }
  },
);
