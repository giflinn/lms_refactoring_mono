// App-level encryption for secrets we keep in Postgres (currently the BCC MAC
// key + callback password the admin enters in the panel). AES-256-GCM with a
// single master key from APP_ENCRYPTION_KEY (.env), set once by the operator.
//
// Threat model: this protects secrets in DB dumps/backups (which don't carry
// .env). It is NOT a defence against a full host compromise — the master key
// lives in .env on the same box. The win is letting the business enter prod
// credentials in the admin panel without touching .env, and not storing the
// MAC key in plaintext in the database.
//
// Blob format: "v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>".

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config";

const VERSION = "v1";

// 32-byte AES-256 key from the hex master key. Throws a clear, snake_case-coded
// error if APP_ENCRYPTION_KEY is unset or malformed (mirrors requireBccConfig).
function masterKey(): Buffer {
  const hex = config.appEncryptionKey;
  if (!hex) throw new Error("app_encryption_key_unset");
  const buf = Buffer.from(hex.trim(), "hex");
  if (buf.length !== 32) throw new Error("app_encryption_key_invalid_length");
  return buf;
}

/** True if APP_ENCRYPTION_KEY is present and a valid 32-byte hex key. */
export function isEncryptionConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 secret → versioned blob. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV, the GCM standard
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/** Decrypt a blob produced by encryptSecret. Throws if tampered or malformed. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("secret_blob_malformed");
  }
  const [, ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Heuristic: does this string look like one of our encrypted blobs? */
export function isEncryptedBlob(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(":").length === 4;
}
