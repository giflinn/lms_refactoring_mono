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
  // HTTP status of the BCC response (set by callers that make an outbound
  // request, e.g. refund). Omitted for results parsed from an inbound callback.
  httpStatus?: number | null;
};

function parseUrlEncoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

// BCC replies to the synchronous server-to-server refund (TRTYPE=14) with JSON
// (content-type application/json), NOT the url-encoded shape the notification
// callback uses. Parse by content-type, falling back to url-encoded. Returns an
// empty map on an unparseable body (→ ACTION/RC null → caller treats it as a
// failure). docs/bcc-payment-integration.md §17.
function parseBccBody(
  text: string,
  contentType: string,
): Record<string, string> {
  if (contentType.includes("application/json")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = v == null ? "" : String(v);
      }
      return out;
    } catch {
      return {};
    }
  }
  return parseUrlEncoded(text);
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
    httpStatus: null,
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
  const ct = res.headers.get("content-type") ?? "";
  const result = { ...toResult(parseBccBody(text, ct)), httpStatus: res.status };
  // Log only the verdict fields — never the raw body, which carries
  // RRN/INT_REF/P_SIGN. action/rc/rcText is enough to tell success
  // (ACTION=0/RC=00) from a gateway decline (e.g. RC=-17 "Access denied").
  console.log(
    "[bcc] refund response",
    `order=${p.bccOrder}`,
    `http=${res.status}`,
    `ct=${ct}`,
    `len=${text.length}`,
    `action=${result.action}`,
    `rc=${result.rc}`,
    `rcText=${result.rcText}`,
  );
  return result;
}
