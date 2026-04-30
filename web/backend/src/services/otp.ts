import { createHash, randomBytes } from "node:crypto";

// 6-digit numeric OTP. Domain is 10^6 — defense-in-depth comes from
// per-code attempt limits and short TTL, not entropy alone.
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// We store SHA-256(code + email) so a DB leak doesn't reveal active codes
// and so the same code for different emails produces different hashes.
export function hashOtpCode(code: string, email: string): string {
  return createHash("sha256")
    .update(`${code}:${email.toLowerCase()}`)
    .digest("hex");
}

// 256-bit URL-safe token issued after a successful /verify. The mobile client
// passes it back to /complete to actually change the password.
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
