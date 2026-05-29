// Inbound server-to-server payment notification from BCC. Public (the bank is
// the caller) but gated by HTTP Basic-Auth (creds handed to the bank). Body is
// application/x-www-form-urlencoded, so this route parses its own body —
// app-level express.json() doesn't touch it.
//
// ⚠️ P_SIGN verification of the notification is NOT yet implemented: the
// response-MAC field order isn't documented and the prior integration never
// verified it (docs §14/§17.1). Until BCC confirms the field order, the trust
// anchor is Basic-Auth + an independent TRTYPE=90 re-check before we settle.
// TODO(bcc): verify P_SIGN once the response field order is confirmed, then the
// extra TRTYPE=90 round-trip below can be dropped.
//
// Idempotent: settlePaid flips at most once; duplicate notifications no-op.
// Always 200 on a processed/duplicate callback so the bank stops retrying.

import { Router, urlencoded, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { paymentTransactions } from "../db/schema";
import { config } from "../config";
import { checkStatus, isPaid } from "../services/bcc/client";
import { settlePaid } from "../services/bcc/settle";

export const bccCallbackRouter = Router();

bccCallbackRouter.post(
  "/payments/bcc/callback",
  urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    if (!checkBasicAuth(req)) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const data = (req.body ?? {}) as Record<string, string>;
    const bccOrder = typeof data.ORDER === "string" ? data.ORDER : "";
    const nonce = typeof data.NONCE === "string" ? data.NONCE : "";
    if (!bccOrder && !nonce) {
      res.status(400).json({ error: "missing_order" });
      return;
    }

    try {
      const [tx] = await db
        .select({
          id: paymentTransactions.id,
          orderId: paymentTransactions.orderId,
          status: paymentTransactions.status,
          bccOrder: paymentTransactions.bccOrder,
        })
        .from(paymentTransactions)
        .where(
          bccOrder
            ? eq(paymentTransactions.bccOrder, Number(bccOrder))
            : eq(paymentTransactions.nonce, nonce),
        )
        .limit(1);

      if (!tx) {
        console.warn("[bcc] callback for unknown order", bccOrder, nonce);
        res.sendStatus(200);
        return;
      }
      if (tx.status !== "pending") {
        res.sendStatus(200); // already settled — idempotent ack
        return;
      }

      if (data.ACTION === "0" && data.RC === "00") {
        // Don't trust the body alone (no P_SIGN verification yet) — confirm via
        // an independent TRTYPE=90 query before settling.
        let confirmed = false;
        try {
          confirmed = isPaid(await checkStatus(String(tx.bccOrder)));
        } catch (err) {
          console.error("[bcc] callback status re-check failed:", err);
        }
        if (confirmed) {
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
          console.warn(
            "[bcc] callback claimed paid but TRTYPE=90 did not confirm",
            tx.bccOrder,
          );
        }
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
      res.sendStatus(200); // ack anyway; the reconcile cron catches up
    }
  },
);

function checkBasicAuth(req: Request): boolean {
  const user = config.bcc.notifyUser ?? "";
  const pass = config.bcc.notifyPass ?? "";
  if (!user || !pass) return false; // not configured → reject (never open)
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString(
    "utf8",
  );
  return safeEqual(decoded, `${user}:${pass}`);
}

function safeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(max);
  const bBuf = Buffer.alloc(max);
  aBuf.write(a);
  bBuf.write(b);
  return timingSafeEqual(aBuf, bBuf);
}
