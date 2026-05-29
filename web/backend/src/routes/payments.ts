// Card payment (BCC) endpoints for the mobile client:
//   POST /payments               — start a card payment for a pending order
//   GET  /payments/:id/checkout  — auto-submit HTML the WebView loads (no auth:
//                                  a WebView navigation can't carry a bearer; the
//                                  id is an unguessable uuid and only renders
//                                  while the attempt is still pending)
//   GET  /payments/:id           — poll status (nudges BCC via TRTYPE=90 if a
//                                  callback hasn't landed yet)
//
// The authoritative "paid" signal is the verified callback / TRTYPE=90, never
// the browser return. See docs/bcc-payment-integration.md §5/§8.

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
import { checkStatus, isPaid } from "../services/bcc/client";
import { settlePaid } from "../services/bcc/settle";

export const paymentsRouter = Router();

function publicBase(): string {
  const b = config.backendPublicUrl;
  if (!b) throw new Error("bcc_backend_public_url_unset");
  return b.replace(/\/+$/, "");
}

// BCC requires NOTIFY_URL to carry an explicit port (docs §3/§14).
function notifyUrl(): string {
  const u = new URL(publicBase());
  if (!u.port) u.port = "443";
  return `${u.toString().replace(/\/+$/, "")}/payments/bcc/callback`;
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

      const [tx] = await db
        .insert(paymentTransactions)
        .values({
          orderId: order.id,
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
          bccOrder: paymentTransactions.bccOrder,
          rc: paymentTransactions.rc,
          rcText: paymentTransactions.rcText,
          orderId: paymentTransactions.orderId,
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

      let status = row.status;
      // Best-effort nudge: if a callback hasn't settled this yet, ask BCC
      // directly so the app isn't stuck on "проверяем оплату".
      if (status === "pending") {
        try {
          const result = await checkStatus(String(row.bccOrder));
          if (isPaid(result)) {
            await settlePaid(row.id, row.orderId, result);
            status = "paid";
          }
        } catch (err) {
          console.error("[bcc] inline status check failed:", err);
        }
      }

      res.json({ paymentId: row.id, status, rc: row.rc, rcText: row.rcText });
    } catch (err) {
      handlePaymentError(err, res, next);
    }
  },
);
