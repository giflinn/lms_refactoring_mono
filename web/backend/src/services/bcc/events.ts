// Append-only audit log of BCC touchpoints (purchase form handed off, inbound
// callbacks incl. forged/unrecognized ones, refund requests/responses).
// Surfaced read-only in admin Settings → BCC. Writes are BEST-EFFORT: a failed
// insert here must never break a payment or a callback ack, so logBccEvent
// swallows its own errors. NONCE and P_SIGN are redacted out of the stored
// payload — they're auth material (the NONCE verifies callbacks).
// docs/bcc-payment-integration.md §17.

import { db } from "../../db";
import { bccEvents } from "../../db/schema";

export type BccEventKind = "purchase_form" | "callback" | "refund";
export type BccEventOutcome =
  | "pending"
  | "success"
  | "declined"
  | "error"
  | "unverified";

export type BccEventInput = {
  kind: BccEventKind;
  outcome: BccEventOutcome;
  paymentTransactionId?: string | null;
  orderId?: string | null;
  bccOrder?: number | null;
  trtype?: string | null;
  action?: string | null;
  rc?: string | null;
  rcText?: string | null;
  httpStatus?: number | null;
  note?: string | null;
  payload?: Record<string, string> | null;
};

const REDACTED = new Set(["NONCE", "P_SIGN"]);

/** Strip auth material (NONCE/P_SIGN) before persisting a raw field map. */
function redact(
  payload: Record<string, string> | null | undefined,
): Record<string, string> | null {
  if (!payload) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = REDACTED.has(k.toUpperCase()) ? "…" : v;
  }
  return out;
}

export async function logBccEvent(e: BccEventInput): Promise<void> {
  try {
    await db.insert(bccEvents).values({
      kind: e.kind,
      outcome: e.outcome,
      paymentTransactionId: e.paymentTransactionId ?? null,
      orderId: e.orderId ?? null,
      bccOrder: e.bccOrder ?? null,
      trtype: e.trtype ?? null,
      action: e.action ?? null,
      rc: e.rc ?? null,
      rcText: e.rcText ?? null,
      httpStatus: e.httpStatus ?? null,
      note: e.note ?? null,
      payload: redact(e.payload),
    });
  } catch (err) {
    // Never let audit logging take down the real flow.
    console.error("[bcc] failed to write event log:", err);
  }
}
