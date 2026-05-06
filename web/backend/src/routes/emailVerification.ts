import { Router } from "express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { emailVerificationCodes } from "../db/schema";
import { firebaseAuth } from "../firebase";
import { requireAuth } from "../middleware/auth";
import { sendEmailVerificationCode } from "../services/mailer";
import {
  generateOtpCode,
  hashOtpCode,
  MAX_OTP_ATTEMPTS,
  MAX_REQUESTS_PER_EMAIL_PER_HOUR,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
} from "../services/otp";

export const emailVerificationRouter = Router();

function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return fallback ?? "";
}

// POST /auth/email-verification/request — generates a 6-digit OTP, hashes it,
// emails it via SMTP. Auth-gated: the user has just signed up (or signed in
// while still unverified) so we already have their Firebase ID token. No
// anti-enumeration here — the email is the authenticated user's own.
emailVerificationRouter.post(
  "/auth/email-verification/request",
  requireAuth,
  async (req, res, next) => {
    try {
      const uid = req.uid!;
      const email = req.email;
      if (!email) {
        res.status(400).json({ error: "email_missing_in_token" });
        return;
      }

      // Read the canonical state from Firebase, not the cached token claim:
      // updateUser → emailVerified=true takes effect immediately, but the
      // client's cached ID token may still claim false until refreshed.
      const fbUser = await firebaseAuth.getUser(uid);
      if (fbUser.emailVerified) {
        res.status(400).json({ error: "already_verified" });
        return;
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await db
        .select({ createdAt: emailVerificationCodes.createdAt })
        .from(emailVerificationCodes)
        .where(
          and(
            eq(emailVerificationCodes.firebaseUid, uid),
            gt(emailVerificationCodes.createdAt, oneHourAgo),
          ),
        )
        .orderBy(desc(emailVerificationCodes.createdAt));

      if (recent.length >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      if (recent.length > 0) {
        const sinceLast = Date.now() - recent[0].createdAt.getTime();
        if (sinceLast < RESEND_COOLDOWN_MS) {
          const retryAfter = Math.ceil(
            (RESEND_COOLDOWN_MS - sinceLast) / 1000,
          );
          res.status(429).json({ error: "cooldown", retryAfter });
          return;
        }
      }

      // Invalidate any previous unconsumed codes so only the newest one is
      // valid (matches password-reset behavior).
      await db
        .update(emailVerificationCodes)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(emailVerificationCodes.firebaseUid, uid),
            isNull(emailVerificationCodes.consumedAt),
          ),
        );

      const code = generateOtpCode();
      await db.insert(emailVerificationCodes).values({
        firebaseUid: uid,
        email,
        codeHash: hashOtpCode(code, email),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        ipAddress: clientIp(req.headers, req.ip),
      });

      await sendEmailVerificationCode(email, code);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /auth/email-verification/verify — accepts {code}, on match marks the
// Firebase user emailVerified=true via the admin SDK. Email comes from the
// verified ID token, not the body — a user can only verify their own address.
emailVerificationRouter.post(
  "/auth/email-verification/verify",
  requireAuth,
  async (req, res, next) => {
    try {
      const uid = req.uid!;
      const email = req.email;
      if (!email) {
        res.status(400).json({ error: "email_missing_in_token" });
        return;
      }
      const code = String(req.body?.code ?? "").trim();
      if (!/^\d{6}$/.test(code)) {
        res.status(400).json({ error: "invalid_input" });
        return;
      }

      const now = new Date();
      const rows = await db
        .select()
        .from(emailVerificationCodes)
        .where(
          and(
            eq(emailVerificationCodes.firebaseUid, uid),
            isNull(emailVerificationCodes.consumedAt),
            gt(emailVerificationCodes.expiresAt, now),
          ),
        )
        .orderBy(desc(emailVerificationCodes.createdAt))
        .limit(1);

      if (rows.length === 0) {
        // No active code. Distinguish "right code but expired/consumed" from
        // "wrong digits" — same UX as password reset.
        const latest = await db
          .select({ codeHash: emailVerificationCodes.codeHash })
          .from(emailVerificationCodes)
          .where(eq(emailVerificationCodes.firebaseUid, uid))
          .orderBy(desc(emailVerificationCodes.createdAt))
          .limit(1);
        const typedHash = hashOtpCode(code, email);
        if (latest.length > 0 && latest[0].codeHash === typedHash) {
          res.status(400).json({ error: "code_expired_or_missing" });
        } else {
          res.status(400).json({ error: "wrong_code" });
        }
        return;
      }
      const record = rows[0];

      if (record.codeHash !== hashOtpCode(code, email)) {
        const newAttempts = record.attempts + 1;
        if (newAttempts >= MAX_OTP_ATTEMPTS) {
          await db
            .update(emailVerificationCodes)
            .set({ attempts: newAttempts, consumedAt: now })
            .where(eq(emailVerificationCodes.id, record.id));
          res.status(400).json({ error: "too_many_attempts" });
          return;
        }
        await db
          .update(emailVerificationCodes)
          .set({ attempts: newAttempts })
          .where(eq(emailVerificationCodes.id, record.id));
        res.status(400).json({ error: "wrong_code" });
        return;
      }

      await firebaseAuth.updateUser(uid, { emailVerified: true });
      await db
        .update(emailVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(emailVerificationCodes.id, record.id));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
