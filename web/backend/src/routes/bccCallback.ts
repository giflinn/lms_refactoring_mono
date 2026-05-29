// Inbound server-to-server payment notification from BCC (urlencoded). Public
// (the bank is the caller). This is the authoritative settle channel — the
// status host (TRTYPE=90) returns an HTML page, not a parseable result, so we
// settle on the notification body, not on a re-check.
//
// Auth model:
//   - Basic-Auth is enforced only when BCC_NOTIFY_USER/PASS are configured
//     (production, registered with the bank). The BCC test sandbox posts the
//     callback WITHOUT Basic-Auth, so when creds aren't set we accept it.
//   - In all cases we verify the echoed NONCE against the stored per-attempt
//     NONCE — a 16-byte CSPRNG secret known only to us and BCC. This stops a
//     forged callback for a guessed ORDER even without Basic-Auth.
//
// ⚠️ Before public launch: set BCC_NOTIFY_USER/PASS (+ register with BCC) AND
// add P_SIGN verification of the notification once BCC confirms the response
// field order. docs/bcc-payment-integration.md §17.
//
// Idempotent: settlePaid flips at most once; duplicate notifications no-op.
// Always 200 on a processed/duplicate callback so the bank stops retrying.

import { Router, urlencoded, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { paymentTransactions } from "../db/schema";
import { config } from "../config";
import { settlePaid } from "../services/bcc/settle";

export const bccCallbackRouter = Router();

bccCallbackRouter.post(
  "/payments/bcc/callback",
  urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    const authConfigured = !!(
      config.bcc.notifyUser && config.bcc.notifyPass
    );
    if (authConfigured) {
      if (!checkBasicAuth(req)) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
    } else {
      console.warn(
        "[bcc] callback accepted without Basic-Auth — BCC_NOTIFY_USER/PASS not set (test mode); NONCE still verified",
      );
    }

    const data = (req.body ?? {}) as Record<string, string>;
    const bccOrder = typeof data.ORDER === "string" ? data.ORDER : "";
    const nonce = typeof data.NONCE === "string" ? data.NONCE : "";
    if (!bccOrder || !nonce) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    try {
      const [tx] = await db
        .select({
          id: paymentTransactions.id,
          orderId: paymentTransactions.orderId,
          status: paymentTransactions.status,
          nonce: paymentTransactions.nonce,
        })
        .from(paymentTransactions)
        .where(eq(paymentTransactions.bccOrder, Number(bccOrder)))
        .limit(1);

      if (!tx) {
        console.warn("[bcc] callback for unknown order", bccOrder);
        res.sendStatus(200);
        return;
      }
      // Per-transaction shared secret: the echoed NONCE must match what we
      // generated for this ORDER. Rejects forged callbacks.
      if (!safeEqual(nonce, tx.nonce)) {
        console.warn("[bcc] callback NONCE mismatch for order", bccOrder);
        res.status(401).json({ error: "invalid_nonce" });
        return;
      }
      if (tx.status !== "pending") {
        res.sendStatus(200); // already settled — idempotent ack
        return;
      }

      if (data.ACTION === "0" && data.RC === "00") {
        await settlePaid(tx.id, tx.orderId, {
          action: data.ACTION ?? null,
          rc: data.RC ?? null,
          rcText: data.RC_TEXT ?? null,
          rrn: data.RRN || null,
          intRef: data.INT_REF || null,
          cardMask: data.CARD_MASK || null,
          raw: data,
        });
      } else {
        // Record the failed attempt; leave the order pending — the user may
        // retry, and the 24h cron finalizes to 'unpaid' if nothing succeeds.
        await db
          .update(paymentTransactions)
          .set({
            status: "failed",
            action: data.ACTION ?? null,
            rc: data.RC ?? null,
            rcText: data.RC_TEXT ?? null,
            rawCallback: data,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentTransactions.id, tx.id),
              eq(paymentTransactions.status, "pending"),
            ),
          );
      }
      res.sendStatus(200);
    } catch (err) {
      console.error("[bcc] callback processing error:", err);
      res.sendStatus(200); // ack anyway
    }
  },
);

function checkBasicAuth(req: Request): boolean {
  const user = config.bcc.notifyUser ?? "";
  const pass = config.bcc.notifyPass ?? "";
  if (!user || !pass) return false;
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(
    header.slice("Basic ".length).trim(),
    "base64",
  ).toString("utf8");
  return safeEqual(decoded, `${user}:${pass}`);
}

function safeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(max);
  const bBuf = Buffer.alloc(max);
  aBuf.write(a);
  bBuf.write(b);
  return timingSafeEqual(aBuf, bBuf) && a.length === b.length;
}
