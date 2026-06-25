// Resolves BCC credentials from the admin-managed store (app_settings) with a
// fallback to the .env config. The two secrets (MAC key, callback password) are
// kept AES-256-GCM-encrypted in the DB; everything else is a plaintext
// identifier. This lets the business enter prod credentials in the admin panel
// (Settings → BCC → Реквизиты) instead of editing .env on the server.
//
//   - resolveBccConfigRaw(): the active config (DB if fully set, else .env).
//   - saveBccConfig():       validate + encrypt + persist (admin write).
//   - getBccConfigForAdmin(): masked view for the panel (never returns the MAC
//                             key — only a fingerprint + "configured" flag).
//
// docs/bcc-payment-integration.md §8/§15.

import { createHash } from "node:crypto";
import { config } from "../../config";
import { db } from "../../db";
import { appSettings } from "../../db/schema";
import { getSettings, maskSecret, SETTING_KEYS } from "../appSettings";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "../secretCrypto";
import { assembleMacKey } from "./sign";

export type BccSource = "db" | "env" | "none";
export type BccMode = "test" | "prod" | "unknown";

export type RawBccConfig = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  macKey: string; // assembled hex (decrypted)
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  notifyPass: string;
  source: BccSource;
};

const DB_KEYS = [
  SETTING_KEYS.bccWebviewUrl,
  SETTING_KEYS.bccMerchantId,
  SETTING_KEYS.bccTerminalId,
  SETTING_KEYS.bccMerchName,
  SETTING_KEYS.bccMerchRnId,
  SETTING_KEYS.bccNotifyUser,
  SETTING_KEYS.bccMacKeyEnc,
  SETTING_KEYS.bccNotifyPassEnc,
] as const;

// The active config: the admin-managed DB row wins when its core fields are all
// present; otherwise the .env fallback (test creds today). Decrypt errors
// (e.g. a rotated master key) propagate — callers that must not crash wrap it.
export async function resolveBccConfigRaw(): Promise<RawBccConfig> {
  const s = await getSettings(DB_KEYS);
  const e = config.bcc;
  const webviewUrl = s[SETTING_KEYS.bccWebviewUrl];
  const merchantId = s[SETTING_KEYS.bccMerchantId];
  const terminalId = s[SETTING_KEYS.bccTerminalId];
  const merchName = s[SETTING_KEYS.bccMerchName];
  const merchRnId = s[SETTING_KEYS.bccMerchRnId];
  const macKeyEnc = s[SETTING_KEYS.bccMacKeyEnc];
  const notifyPassEnc = s[SETTING_KEYS.bccNotifyPassEnc];

  // Callback Basic-Auth creds resolve INDEPENDENTLY of the core source (DB if
  // set, else the .env fallback). Switching the core config to the DB must
  // never silently drop the .env-registered callback auth — otherwise the
  // settle callback would accept unauthenticated POSTs (security review,
  // 2026-06-25). A decrypt failure here propagates; the callback fails closed.
  const notifyUser = s[SETTING_KEYS.bccNotifyUser] || (e.notifyUser ?? "");
  const notifyPass =
    (notifyPassEnc ? decryptSecret(notifyPassEnc) : "") || (e.notifyPass ?? "");

  const dbConfigured = !!(
    webviewUrl &&
    merchantId &&
    terminalId &&
    merchName &&
    macKeyEnc
  );
  if (dbConfigured) {
    return {
      webviewUrl,
      merchantId,
      terminalId,
      merchName,
      merchRnId,
      notifyUser,
      macKey: decryptSecret(macKeyEnc),
      notifyPass,
      source: "db",
    };
  }

  const envConfigured = !!(
    e.webviewUrl &&
    e.merchantId &&
    e.terminalId &&
    e.merchName &&
    e.macKey
  );
  return {
    webviewUrl: e.webviewUrl ?? "",
    merchantId: e.merchantId ?? "",
    terminalId: e.terminalId ?? "",
    merchName: e.merchName ?? "",
    merchRnId: e.merchRnId ?? "",
    notifyUser,
    macKey: e.macKey ?? "",
    notifyPass,
    source: envConfigured ? "env" : "none",
  };
}

// ---- admin-facing view (masked) -------------------------------------------

export type BccAdminView = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  macKeyConfigured: boolean;
  macKeyFingerprint: string | null; // self-check only — NOT the bank's KCV
  notifyPassMasked: string;
  callbackAuthEnabled: boolean; // is the callback Basic-Auth pair set?
  source: BccSource;
  mode: BccMode;
  encryptionConfigured: boolean;
};

function detectMode(webviewUrl: string): BccMode {
  if (!webviewUrl) return "unknown";
  if (webviewUrl.includes("test3ds")) return "test";
  if (webviewUrl.includes("3dsecure.bcc.kz")) return "prod";
  return "unknown";
}

// A non-reversible fingerprint of the assembled MAC key so the admin can
// confirm they entered the same key twice / matches a reference. Deliberately
// NOT labelled a KCV — BCC's KCV algorithm differs and we don't reproduce it.
function macFingerprint(macKeyHex: string): string {
  return createHash("sha256")
    .update(macKeyHex.toUpperCase(), "utf8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

export async function getBccConfigForAdmin(): Promise<BccAdminView> {
  const c = await resolveBccConfigRaw();
  return {
    webviewUrl: c.webviewUrl,
    merchantId: c.merchantId,
    terminalId: c.terminalId,
    merchName: c.merchName,
    merchRnId: c.merchRnId,
    notifyUser: c.notifyUser,
    macKeyConfigured: !!c.macKey,
    macKeyFingerprint: c.macKey ? macFingerprint(c.macKey) : null,
    notifyPassMasked: maskSecret(c.notifyPass),
    callbackAuthEnabled: !!(c.notifyUser && c.notifyPass),
    source: c.source,
    mode: detectMode(c.webviewUrl),
    encryptionConfigured: isEncryptionConfigured(),
  };
}

// ---- admin write ----------------------------------------------------------

export type SaveBccInput = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  // MAC key — supply EITHER the two bank-issued components (XOR-assembled) OR a
  // pre-assembled hex key. Omit/blank to keep the current one (write-only).
  macKeyComponentA?: string | null;
  macKeyComponentB?: string | null;
  macKey?: string | null;
  // Callback Basic-Auth password — blank to keep the current one (write-only).
  notifyPass?: string | null;
};

function isHex(s: string): boolean {
  return s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
}

// 16 alphanumeric AND ≥1 digit — an all-letters value passes purchase but fails
// reversal with RC=95 "Reconcile error" (see docs §4.1, 2026-06-19 incident).
function isValidMerchRnId(s: string): boolean {
  return /^(?=.*\d)[A-Za-z0-9]{16}$/.test(s);
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Resolve the new assembled MAC key from the input, or null to keep the current.
// Throws snake_case-coded errors on malformed input.
function resolveNewMacKey(input: SaveBccInput): string | null {
  const a = (input.macKeyComponentA ?? "").trim();
  const b = (input.macKeyComponentB ?? "").trim();
  if (a || b) {
    if (!isHex(a) || !isHex(b)) throw new Error("bcc_mac_component_invalid");
    const assembled = assembleMacKey(a, b); // throws bcc_key_component_length_mismatch
    if (assembled.length < 16 || assembled.length > 64) {
      throw new Error("bcc_mac_key_invalid");
    }
    return assembled;
  }
  const k = (input.macKey ?? "").trim();
  if (k) {
    if (!isHex(k) || k.length < 16 || k.length > 64) {
      throw new Error("bcc_mac_key_invalid");
    }
    return k.toUpperCase();
  }
  return null;
}

export async function saveBccConfig(
  input: SaveBccInput,
  userId: string,
): Promise<void> {
  const webviewUrl = (input.webviewUrl ?? "").trim();
  const merchantId = (input.merchantId ?? "").trim();
  const terminalId = (input.terminalId ?? "").trim();
  const merchName = (input.merchName ?? "").trim();
  const merchRnId = (input.merchRnId ?? "").trim();
  const notifyUser = (input.notifyUser ?? "").trim();

  if (!isValidUrl(webviewUrl)) throw new Error("bcc_webview_url_invalid");
  if (!merchantId || !terminalId || !merchName) {
    throw new Error("bcc_required_field_missing");
  }
  if (merchRnId && !isValidMerchRnId(merchRnId)) {
    throw new Error("bcc_merch_rn_id_invalid");
  }

  // Resolve + validate the secrets BEFORE writing anything (encryptSecret
  // throws app_encryption_key_unset if APP_ENCRYPTION_KEY is missing — surface
  // that before we persist a half-written config).
  const newMac = resolveNewMacKey(input);
  const newMacEnc = newMac ? encryptSecret(newMac) : null;
  const notifyPass = (input.notifyPass ?? "").trim();
  const newNotifyPassEnc = notifyPass ? encryptSecret(notifyPass) : null;

  // Persist atomically so a mid-write failure can't pair new identifiers with a
  // stale MAC key (→ wrong P_SIGN). Secrets only overwrite when a new value was
  // supplied (write-only fields).
  await db.transaction(async (tx) => {
    const now = new Date();
    const put = (key: string, value: string) =>
      tx
        .insert(appSettings)
        .values({ key, value, updatedAt: now, updatedByUserId: userId })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now, updatedByUserId: userId },
        });
    await put(SETTING_KEYS.bccWebviewUrl, webviewUrl);
    await put(SETTING_KEYS.bccMerchantId, merchantId);
    await put(SETTING_KEYS.bccTerminalId, terminalId);
    await put(SETTING_KEYS.bccMerchName, merchName);
    await put(SETTING_KEYS.bccMerchRnId, merchRnId);
    await put(SETTING_KEYS.bccNotifyUser, notifyUser);
    if (newMacEnc) await put(SETTING_KEYS.bccMacKeyEnc, newMacEnc);
    if (newNotifyPassEnc) {
      await put(SETTING_KEYS.bccNotifyPassEnc, newNotifyPassEnc);
    }
  });
}
