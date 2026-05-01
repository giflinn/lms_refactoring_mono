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
  },
};
