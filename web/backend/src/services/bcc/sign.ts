// BCC (Bank CenterCredit) MAC signing — the P_SIGN field on every request.
//
// Algorithm (verified against the doc's TRTYPE=1/90/14 test vectors — see
// sign.test.ts): build a "source string" by concatenating, for each field in
// the operation's fixed order, the decimal length of the value followed by the
// value itself; then HMAC-SHA1 it with the assembled MAC key (HEX-decoded) and
// hex-encode upper-case. Per-TRTYPE field orders are documented in
// docs/bcc-payment-integration.md §3.
//
// The MAC key is the XOR of the two key components the bank issues; we store
// the already-assembled hex key in config (BCC_MAC_KEY). assembleMacKey() is a
// helper for go-live, when you receive the two prod components.

import { createHmac } from "node:crypto";

/** Length-prefixed concatenation of the ordered field values. */
export function sourceString(values: string[]): string {
  return values.map((v) => `${v.length}${v}`).join("");
}

/** P_SIGN = HMAC-SHA1(macKey, sourceString(values)) — hex, upper-case. */
export function pSign(values: string[], macKeyHex: string): string {
  return createHmac("sha1", Buffer.from(macKeyHex, "hex"))
    .update(sourceString(values), "utf8")
    .digest("hex")
    .toUpperCase();
}

/** XOR two equal-length hex key components into the assembled MAC key. */
export function assembleMacKey(componentA: string, componentB: string): string {
  const a = Buffer.from(componentA, "hex");
  const b = Buffer.from(componentB, "hex");
  if (a.length !== b.length || a.length === 0) {
    throw new Error("bcc_key_component_length_mismatch");
  }
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out.toString("hex").toUpperCase();
}

// Field orders for request signing, by TRTYPE. docs/bcc-payment-integration.md §3.
export const PURCHASE_FIELD_ORDER = [
  "AMOUNT",
  "CURRENCY",
  "ORDER",
  "MERCHANT",
  "TERMINAL",
  "MERCH_GMT",
  "TIMESTAMP",
  "TRTYPE",
  "NONCE",
] as const;

export const STATUS_FIELD_ORDER = [
  "ORDER",
  "TERMINAL",
  "TIMESTAMP",
  "TRTYPE",
  "NONCE",
] as const;

export const REFUND_FIELD_ORDER = [
  "ORDER",
  "ORG_AMOUNT",
  "AMOUNT",
  "CURRENCY",
  "RRN",
  "INT_REF",
  "TERMINAL",
  "TIMESTAMP",
  "TRTYPE",
  "NONCE",
] as const;

/** Sign a field map by pulling its values in the given field-name order. */
export function signFields(
  fields: Record<string, string>,
  order: readonly string[],
  macKeyHex: string,
): string {
  const values = order.map((name) => {
    const v = fields[name];
    if (v === undefined) throw new Error(`bcc_sign_missing_field:${name}`);
    return v;
  });
  return pSign(values, macKeyHex);
}
