// Apple App Store Server API client + JWS verifier wrapper. Used to verify iOS
// In-App Purchase transactions before settling an order, and to verify App
// Store Server Notifications V2 (refunds/revokes). Built on Apple's official
// `@apple/app-store-server-library`. See docs/ios-appstore-compliance-tz.md.
//
// Config is optional at startup (same policy as bcc/smtp) — the first verify
// call throws a clear AppleIapError if credentials or root certs are missing,
// so a dev machine without Apple config still boots.

import fs from "node:fs";
import path from "node:path";
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { config } from "../../config";

export class AppleIapError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// Apple Root CA certificates (public, static). Drop the *.cer files from
// https://www.apple.com/certificateauthority/ into web/backend/apple-certs/.
// Resolved from cwd like the upload dirs (pm2/dev both run from the backend root).
const CERTS_DIR = path.resolve(process.cwd(), "apple-certs");

let rootCertsCache: Buffer[] | null = null;
function loadRootCerts(): Buffer[] {
  if (rootCertsCache) return rootCertsCache;
  let files: string[];
  try {
    files = fs
      .readdirSync(CERTS_DIR)
      .filter((f) => /\.(cer|pem|der|crt)$/i.test(f));
  } catch {
    throw new AppleIapError("apple_root_certs_missing");
  }
  if (files.length === 0) throw new AppleIapError("apple_root_certs_missing");
  rootCertsCache = files.map((f) => fs.readFileSync(path.join(CERTS_DIR, f)));
  return rootCertsCache;
}

function creds() {
  const { issuerId, keyId, privateKey, bundleId } = config.appleIap;
  if (!issuerId || !keyId || !privateKey || !bundleId) {
    throw new AppleIapError("apple_iap_not_configured");
  }
  // The .p8 is stored single-line in .env with literal "\n" escapes (env files
  // don't carry real newlines reliably); restore them so it parses as PEM.
  return {
    issuerId,
    keyId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    bundleId,
  };
}

const apiClientCache = new Map<Environment, AppStoreServerAPIClient>();
function apiClient(env: Environment): AppStoreServerAPIClient {
  let client = apiClientCache.get(env);
  if (!client) {
    const { issuerId, keyId, privateKey, bundleId } = creds();
    client = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      bundleId,
      env,
    );
    apiClientCache.set(env, client);
  }
  return client;
}

const verifierCache = new Map<Environment, SignedDataVerifier>();
function verifier(env: Environment): SignedDataVerifier {
  let v = verifierCache.get(env);
  if (!v) {
    const { bundleId } = creds();
    // appAppleId is required for Production verification; Sandbox omits it.
    if (env === Environment.PRODUCTION && config.appleIap.appAppleId == null) {
      throw new AppleIapError("apple_app_apple_id_missing");
    }
    v = new SignedDataVerifier(
      loadRootCerts(),
      true, // enableOnlineChecks — OCSP revocation checks (recommended for prod)
      env,
      bundleId,
      env === Environment.PRODUCTION ? config.appleIap.appAppleId : undefined,
    );
    verifierCache.set(env, v);
  }
  return v;
}

// Fetch a transaction by id from the App Store Server API and verify its JWS
// signature. Tries Production first, then Sandbox (App Review pays in Sandbox).
// Returns the verified, decoded transaction payload.
export async function verifyTransactionById(
  transactionId: string,
): Promise<JWSTransactionDecodedPayload> {
  const envs = [Environment.PRODUCTION, Environment.SANDBOX];
  let lastErr: unknown;
  for (const env of envs) {
    try {
      const resp = await apiClient(env).getTransactionInfo(transactionId);
      const signed = resp.signedTransactionInfo;
      if (!signed) throw new AppleIapError("apple_tx_invalid");
      return await verifier(env).verifyAndDecodeTransaction(signed);
    } catch (err) {
      // Config / cert problems are not environment-specific — fail fast.
      if (err instanceof AppleIapError) throw err;
      // Otherwise the transaction may simply live in the other environment;
      // remember the error and try Sandbox.
      lastErr = err;
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new AppleIapError("apple_tx_invalid");
}

export type VerifiedNotification = {
  notificationType: string | undefined;
  subtype: string | undefined;
  // The decoded inner transaction (present for transaction-bearing events like
  // REFUND/REVOKE), verified with the same environment as the notification.
  transaction: JWSTransactionDecodedPayload | null;
};

// Verify an App Store Server Notification V2 signedPayload (the webhook body)
// and, when present, the inner signed transaction. Tries both environments (a
// sandbox notification won't verify against the production verifier and vice
// versa); verifyAndDecodeNotification itself rejects an env/bundle mismatch, so
// only the correct verifier succeeds.
export async function verifyNotification(
  signedPayload: string,
): Promise<VerifiedNotification> {
  let lastErr: unknown;
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const v = verifier(env);
      const payload: ResponseBodyV2DecodedPayload =
        await v.verifyAndDecodeNotification(signedPayload);
      let transaction: JWSTransactionDecodedPayload | null = null;
      const signedTx = payload.data?.signedTransactionInfo;
      if (signedTx) {
        transaction = await v.verifyAndDecodeTransaction(signedTx);
      }
      return {
        notificationType: payload.notificationType as string | undefined,
        subtype: payload.subtype as string | undefined,
        transaction,
      };
    } catch (err) {
      if (err instanceof AppleIapError) throw err;
      lastErr = err;
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new AppleIapError("apple_notification_invalid");
}
