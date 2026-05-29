// Build the signed purchase (TRTYPE=1) field set and the auto-submit HTML the
// mobile WebView loads. Signing happens here — server-side, the MAC key never
// leaves the backend; the WebView merely POSTs the pre-signed form to BCC,
// which satisfies the doc's "auth ops must be browser-side" rule (ВАЖНО 2).
// docs/bcc-payment-integration.md §4.1/§8.

import { randomBytes } from "node:crypto";
import { config } from "../../config";
import { PURCHASE_FIELD_ORDER, signFields } from "./sign";

export type BccConfig = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  macKey: string;
  merchName: string;
  merchRnId: string;
};

// Throws a clear, snake_case-coded error if any required BCC var is unset
// (mirrors mailer.ts's first-use check). Lets a dev machine without BCC config
// boot fine and fail only when a card payment is actually attempted.
export function requireBccConfig(): BccConfig {
  const c = config.bcc;
  const missing: string[] = [];
  if (!c.webviewUrl) missing.push("BCC_WEBVIEW_URL");
  if (!c.merchantId) missing.push("BCC_MERCHANT_ID");
  if (!c.terminalId) missing.push("BCC_TERMINAL_ID");
  if (!c.macKey) missing.push("BCC_MAC_KEY");
  if (!c.merchName) missing.push("BCC_MERCH_NAME");
  if (missing.length > 0) {
    throw new Error(`bcc_not_configured:${missing.join(",")}`);
  }
  return {
    webviewUrl: c.webviewUrl!,
    merchantId: c.merchantId!,
    terminalId: c.terminalId!,
    macKey: c.macKey!,
    merchName: c.merchName!,
    merchRnId: c.merchRnId ?? "",
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
  now: Date;
};

// Build the full signed TRTYPE=1 field map. TIMESTAMP and AMOUNT are computed
// once and reused for both the signature and the body — the two bugs the prior
// Django integration shipped (docs §14): it called now() twice and signed a
// different amount variable than it sent.
export function buildPurchaseFields(
  input: PurchaseInput,
): Record<string, string> {
  const cfg = requireBccConfig();
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
    MERCH_NAME: cfg.merchName,
    MERCH_RN_ID: cfg.merchRnId,
    DESC: input.desc,
    BACKREF: input.backref,
    NOTIFY_URL: input.notifyUrl,
    LANG: "ru",
    MK_TOKEN: "MERCH",
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
