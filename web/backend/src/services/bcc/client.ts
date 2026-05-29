// Server-side BCC operations the merchant initiates directly (not browser-
// side): the TRTYPE=90 status check. Purchase is browser-side (checkout.ts);
// refund/void (TRTYPE=14/22) land in Phase 2. docs/bcc-payment-integration.md §8.

import { REFUND_FIELD_ORDER, STATUS_FIELD_ORDER, signFields } from "./sign";
import { bccNonce, bccTimestamp, requireBccConfig } from "./checkout";

export type BccResult = {
  action: string | null;
  rc: string | null;
  rcText: string | null;
  rrn: string | null;
  intRef: string | null;
  cardMask: string | null;
  raw: Record<string, string>;
};

function parseUrlEncoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

export function toResult(raw: Record<string, string>): BccResult {
  return {
    action: raw.ACTION ?? null,
    rc: raw.RC ?? null,
    rcText: raw.RC_TEXT ?? null,
    rrn: raw.RRN || null,
    intRef: raw.INT_REF || null,
    cardMask: raw.CARD_MASK || null,
    raw,
  };
}

// Query the status of a prior operation by its ORDER (TRTYPE=90, valid ≤24h).
// NOTE: the exact semantics of the status RESPONSE (does ACTION/RC reflect the
// query or the original txn's outcome?) need confirming with BCC — docs §17.
// We treat ACTION=0 & RC=00 conservatively as "the queried purchase is
// approved". Used by the callback re-check and the reconcile cron.
export async function checkStatus(bccOrder: string): Promise<BccResult> {
  const cfg = requireBccConfig();
  const fields: Record<string, string> = {
    ORDER: bccOrder,
    TERMINAL: cfg.terminalId,
    TIMESTAMP: bccTimestamp(new Date()),
    TRTYPE: "90",
    NONCE: bccNonce(),
  };
  fields.P_SIGN = signFields(fields, STATUS_FIELD_ORDER, cfg.macKey);

  const res = await fetch(cfg.webviewUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return toResult(parseUrlEncoded(await res.text()));
}

/** Generic success check (ACTION=0 & RC=00) — purchase, status, or refund. */
export function isSuccess(r: {
  action: string | null;
  rc: string | null;
}): boolean {
  return r.action === "0" && r.rc === "00";
}

/** Did this result represent a successful payment? Alias of isSuccess. */
export function isPaid(r: { action: string | null; rc: string | null }): boolean {
  return isSuccess(r);
}

// Full refund of a prior purchase (TRTYPE=14, ≤30 days). Needs RRN + INT_REF
// from the original purchase notification. Same-day instant void (TRTYPE=22) is
// a future optimization; TRTYPE=14 works across the whole window (settles next
// day). docs/bcc-payment-integration.md §3/§4.
export async function refund(p: {
  bccOrder: string;
  amount: string;
  rrn: string;
  intRef: string;
}): Promise<BccResult> {
  const cfg = requireBccConfig();
  const fields: Record<string, string> = {
    ORDER: p.bccOrder,
    ORG_AMOUNT: p.amount,
    AMOUNT: p.amount,
    CURRENCY: "398",
    RRN: p.rrn,
    INT_REF: p.intRef,
    TERMINAL: cfg.terminalId,
    TIMESTAMP: bccTimestamp(new Date()),
    TRTYPE: "14",
    NONCE: bccNonce(),
  };
  fields.P_SIGN = signFields(fields, REFUND_FIELD_ORDER, cfg.macKey);
  const res = await fetch(cfg.webviewUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return toResult(parseUrlEncoded(await res.text()));
}
