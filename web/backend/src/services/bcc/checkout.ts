// Build the signed purchase (TRTYPE=1) field set and the auto-submit HTML the
// mobile WebView loads. Signing happens here — server-side, the MAC key never
// leaves the backend; the WebView merely POSTs the pre-signed form to BCC,
// which satisfies the doc's "auth ops must be browser-side" rule (ВАЖНО 2).
// docs/bcc-payment-integration.md §4.1/§8.

import { randomBytes } from "node:crypto";
import { PURCHASE_FIELD_ORDER, signFields } from "./sign";
import { resolveBccConfigRaw } from "./configStore";

export type BccConfig = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  macKey: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  notifyPass: string;
};

// Resolve the active BCC config (admin-managed DB row, else the .env fallback —
// see configStore.ts) and assert the core fields are present. Throws a clear,
// snake_case-coded error otherwise, so a machine without BCC config boots fine
// and fails only when a card payment is actually attempted.
export async function requireBccConfig(): Promise<BccConfig> {
  const c = await resolveBccConfigRaw();
  const missing: string[] = [];
  if (!c.webviewUrl) missing.push("webviewUrl");
  if (!c.merchantId) missing.push("merchantId");
  if (!c.terminalId) missing.push("terminalId");
  if (!c.macKey) missing.push("macKey");
  if (!c.merchName) missing.push("merchName");
  if (missing.length > 0) {
    throw new Error(`bcc_not_configured:${missing.join(",")}`);
  }
  return {
    webviewUrl: c.webviewUrl,
    merchantId: c.merchantId,
    terminalId: c.terminalId,
    macKey: c.macKey,
    merchName: c.merchName,
    merchRnId: c.merchRnId,
    notifyUser: c.notifyUser,
    notifyPass: c.notifyPass,
  };
}

/** GMT timestamp YYYYMMDDHHMMSS (UTC, paired with MERCH_GMT="0"). */
export function bccTimestamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  );
}

/** Fresh CSPRNG nonce: 16 bytes hex, upper-case, no dashes (per the doc). */
export function bccNonce(): string {
  return randomBytes(16).toString("hex").toUpperCase();
}

export type PurchaseInput = {
  bccOrder: string; // numeric ORDER (string form of payment_transactions.bcc_order)
  amountTenge: string; // "8000.00" — 2 decimals, exactly as signed and sent
  nonce: string;
  desc: string;
  backref: string;
  notifyUrl: string;
  clientIp: string; // payer IP — BCC CLIENT_IP (mandatory for 3DS)
  mobilePhone: { cc: string; subscriber: string } | null; // M_INFO.mobilePhone
  now: Date;
};

// 3DS2 data the merchant supplies (M_INFO) — base64-encoded JSON, mandatory for
// 3DS per the BCC doc. The bank's 3DS page does its own device fingerprinting;
// these are supplementary merchant hints. Screen size is a static placeholder
// (the WebView's real size isn't round-tripped to the backend); mobilePhone
// comes from the payer's profile when available. Not in PURCHASE_FIELD_ORDER →
// doesn't affect P_SIGN. docs/bcc-payment-integration.md §4.2.
function buildMInfo(
  mobilePhone: { cc: string; subscriber: string } | null,
): string {
  const info: Record<string, unknown> = {
    browserScreenHeight: "1920",
    browserScreenWidth: "1080",
  };
  if (mobilePhone) info.mobilePhone = mobilePhone;
  return Buffer.from(JSON.stringify(info), "utf8").toString("base64");
}

// Build the full signed TRTYPE=1 field map. TIMESTAMP and AMOUNT are computed
// once and reused for both the signature and the body — the two bugs the prior
// Django integration shipped (docs §14): it called now() twice and signed a
// different amount variable than it sent.
export async function buildPurchaseFields(
  input: PurchaseInput,
): Promise<Record<string, string>> {
  const cfg = await requireBccConfig();
  const timestamp = bccTimestamp(input.now);
  const signed: Record<string, string> = {
    AMOUNT: input.amountTenge,
    CURRENCY: "398",
    ORDER: input.bccOrder,
    MERCHANT: cfg.merchantId,
    TERMINAL: cfg.terminalId,
    MERCH_GMT: "0",
    TIMESTAMP: timestamp,
    TRTYPE: "1",
    NONCE: input.nonce,
  };
  const psign = signFields(signed, PURCHASE_FIELD_ORDER, cfg.macKey);
  return {
    ...signed,
    P_SIGN: psign,
    // Unsigned fields below — none are in PURCHASE_FIELD_ORDER, so they don't
    // affect P_SIGN. COUNTRY/M_INFO/CLIENT_IP are mandatory per the BCC doc
    // (COUNTRY always, M_INFO+CLIENT_IP for 3DS). docs/bcc-payment-integration.md §4.1.
    COUNTRY: "KZ",
    MERCH_NAME: cfg.merchName,
    MERCH_RN_ID: cfg.merchRnId,
    DESC: input.desc,
    BACKREF: input.backref,
    NOTIFY_URL: input.notifyUrl,
    LANG: "ru",
    MK_TOKEN: "MERCH",
    CLIENT_IP: input.clientIp,
    M_INFO: buildMInfo(input.mobilePhone),
  };
}

/** Self-submitting HTML form that POSTs the signed fields to the BCC host. */
export function checkoutHtml(
  actionUrl: string,
  fields: Record<string, string>,
): string {
  const inputs = Object.entries(fields)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
    )
    .join("\n    ");
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Оплата</title></head>
<body onload="document.forms[0].submit()">
  <form method="post" action="${escapeHtml(actionUrl)}" accept-charset="UTF-8">
    ${inputs}
    <noscript><button type="submit">Продолжить оплату</button></noscript>
  </form>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}
