// Server-side BCC operations the merchant initiates directly (not browser-
// side): refund (TRTYPE=14). Purchase is browser-side (checkout.ts) and the
// settle signal is the notification callback. (Server-side TRTYPE=90 status
// polling was dropped — the status host returns an HTML page, not a parseable
// result — see docs/bcc-payment-integration.md §17.)

import { REFUND_FIELD_ORDER, signFields } from "./sign";
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

/** Generic success check (ACTION=0 & RC=00) — purchase or refund. */
export function isSuccess(r: {
  action: string | null;
  rc: string | null;
}): boolean {
  return r.action === "0" && r.rc === "00";
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
  const text = await res.text();
  // Diagnostic: the test 3DS host has returned non-key=value bodies for
  // server-to-server ops before (TRTYPE=90 status was dropped for exactly
  // this). When a refund "declines" with all-null ACTION/RC it means the body
  // wasn't parseable — log the raw response so we can see what BCC actually
  // returns (HTML? error? empty?). Safe to drop once the refund mechanism is
  // confirmed with the bank. docs/bcc-payment-integration.md §17.
  console.log(
    "[bcc] refund response",
    `order=${p.bccOrder}`,
    `http=${res.status}`,
    `ct=${res.headers.get("content-type") ?? ""}`,
    `len=${text.length}`,
    `body=${text.slice(0, 1000)}`,
  );
  return toResult(parseUrlEncoded(text));
}
