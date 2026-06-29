// Single source of truth for environment variables. Importing this module at
// startup fails fast (with a useful message) if a required var is missing,
// instead of silently breaking on the first request that needs it.
//
// Add a new env var here AND in .env.example (and .env locally). Don't read
// process.env directly anywhere else in the codebase.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. ` +
        `Make sure web/backend/.env exists and is loaded ` +
        `(npm run dev uses --env-file=.env). See .env.example.`,
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? "3000"),

  // Required at startup — the app can't function without these.
  databaseUrl: required("DATABASE_URL"),
  firebaseServiceAccountPath: required("FIREBASE_SERVICE_ACCOUNT_PATH"),

  // SMTP is only needed for the password-reset OTP flow. We deliberately don't
  // validate it at startup so a partially-configured dev machine can still run
  // everything else. mailer.ts checks at first send and throws a clear error
  // if SMTP_HOST/PORT/USER/PASS are missing.
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    // Override the TLS SNI / hostname used for cert validation. Needed on
    // shared hosting where the SMTP server presents a wildcard cert for the
    // hosting provider's domain (e.g. *.hoster.kz) instead of the mail
    // domain itself.
    tlsServername: process.env.SMTP_TLS_SERVERNAME,
  },

  // Public HTTPS URL the backend is reachable at, used to register the
  // Telegram webhook (`${backendPublicUrl}/telegram/webhook`). Telegram
  // requires HTTPS and one of ports 443/80/88/8443 — production points at
  // https://app.zhannaslyamova.net/api. Empty in local dev → bot init logs
  // a warning and skips setWebhook (admin can still save the token; webhook
  // wiring activates once this is set).
  backendPublicUrl: (process.env.BACKEND_PUBLIC_URL ?? "").trim(),

  // BCC (Bank CenterCredit) card-payment gateway. All optional at startup —
  // the payment service throws a clear error at first use if a field is
  // missing, so a dev machine without BCC config still boots (same policy as
  // smtp). Real values are deployed out-of-band (secrets, not in git).
  // BCC_MAC_KEY is the assembled HMAC key (XOR of the two bank-issued key
  // components). NOTIFY_URL / BACKREF are derived from backendPublicUrl.
  // See docs/bcc-payment-integration.md.
  bcc: {
    webviewUrl: process.env.BCC_WEBVIEW_URL,
    merchantId: process.env.BCC_MERCHANT_ID,
    terminalId: process.env.BCC_TERMINAL_ID,
    macKey: process.env.BCC_MAC_KEY,
    merchName: process.env.BCC_MERCH_NAME,
    merchRnId: process.env.BCC_MERCH_RN_ID,
    notifyUser: process.env.BCC_NOTIFY_USER,
    notifyPass: process.env.BCC_NOTIFY_PASS,
  },

  // Apple In-App Purchase (StoreKit) — verifying iOS digital purchases via the
  // App Store Server API and receiving App Store Server Notifications V2. All
  // optional at startup (same policy as bcc/smtp): the Apple payment route
  // throws a clear error at first use if a field is missing, so a dev machine
  // without Apple config still boots. Values deployed out-of-band (secrets).
  //   - issuerId / keyId / privateKey: App Store Connect API key (.p8 contents).
  //   - bundleId: kz.zhannaslyamova.lms.ios — checked against each transaction.
  // See docs/ios-appstore-compliance-tz.md.
  appleIap: {
    issuerId: process.env.APPLE_IAP_ISSUER_ID,
    keyId: process.env.APPLE_IAP_KEY_ID,
    privateKey: process.env.APPLE_IAP_PRIVATE_KEY,
    bundleId: process.env.APPLE_IAP_BUNDLE_ID,
    // The app's numeric App Store ID (App Store Connect → App Information →
    // General → Apple ID). REQUIRED to verify Production transactions and
    // notifications; omitted/unused for Sandbox (App Review pays in Sandbox).
    appAppleId: process.env.APPLE_IAP_APP_APPLE_ID
      ? Number(process.env.APPLE_IAP_APP_APPLE_ID)
      : undefined,
  },

  // 32-byte master key (64 hex chars) for app-level encryption of secrets
  // stored in Postgres — currently the admin-entered BCC MAC key + callback
  // password (services/secretCrypto.ts, AES-256-GCM). Optional at startup;
  // secretCrypto throws a clear error only when an encrypted value is actually
  // read/written without it, so a dev machine still boots. Generate with
  // `openssl rand -hex 32`. Deployed out-of-band (secret, not in git).
  appEncryptionKey: process.env.APP_ENCRYPTION_KEY,
};
