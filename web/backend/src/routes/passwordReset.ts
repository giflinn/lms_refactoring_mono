import { Router } from "express";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { passwordResetCodes, users } from "../db/schema";
import { firebaseAuth } from "../firebase";
import { sendPasswordResetCode } from "../services/mailer";
import {
  generateOtpCode,
  generateResetToken,
  hashOtpCode,
  MAX_OTP_ATTEMPTS,
  MAX_REQUESTS_PER_EMAIL_PER_HOUR,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
} from "../services/otp";
import {
  isValidEmail,
  isValidPassword,
} from "../services/validation";

export const passwordResetRouter = Router();

function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return fallback ?? "";
}

// POST /auth/password-reset/request — accepts {email}, generates a 6-digit
// code, emails it. Always returns {ok: true} regardless of whether the email
// exists (anti-enumeration). Rate-limited per email.
passwordResetRouter.post("/auth/password-reset/request", async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }

    // Rate-limit: how many active codes have we issued for this email recently?
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db
      .select({ createdAt: passwordResetCodes.createdAt })
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.email, email),
          gt(passwordResetCodes.createdAt, oneHourAgo),
        ),
      )
      .orderBy(desc(passwordResetCodes.createdAt));

    if (recent.length >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    if (recent.length > 0) {
      const sinceLast = Date.now() - recent[0].createdAt.getTime();
      if (sinceLast < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
        res.status(429).json({ error: "cooldown", retryAfter });
        return;
      }
    }

    // Look up the user. If not found, bail silently (anti-enumeration) — we
    // still pretend to succeed to the caller.
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userRows.length === 0) {
      res.json({ ok: true });
      return;
    }

    // Invalidate any previous unconsumed codes for this email so only the
    // newest one is valid.
    await db
      .update(passwordResetCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetCodes.email, email),
          isNull(passwordResetCodes.consumedAt),
        ),
      );

    const code = generateOtpCode();
    await db.insert(passwordResetCodes).values({
      email,
      codeHash: hashOtpCode(code, email),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ipAddress: clientIp(req.headers, req.ip),
    });

    await sendPasswordResetCode(email, code);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password-reset/verify — accepts {email, code}, returns
// {resetToken} on match. Increments the attempt counter on the active record;
// after MAX_OTP_ATTEMPTS the code is consumed/invalidated and the user must
// request a new one.
passwordResetRouter.post("/auth/password-reset/verify", async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }

    const now = new Date();
    const rows = await db
      .select()
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.email, email),
          isNull(passwordResetCodes.consumedAt),
          gt(passwordResetCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);

    if (rows.length === 0) {
      res.status(400).json({ error: "code_expired_or_missing" });
      return;
    }
    const record = rows[0];

    if (record.codeHash !== hashOtpCode(code, email)) {
      const newAttempts = record.attempts + 1;
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await db
          .update(passwordResetCodes)
          .set({ attempts: newAttempts, consumedAt: now })
          .where(eq(passwordResetCodes.id, record.id));
        res.status(400).json({ error: "too_many_attempts" });
        return;
      }
      await db
        .update(passwordResetCodes)
        .set({ attempts: newAttempts })
        .where(eq(passwordResetCodes.id, record.id));
      res.status(400).json({ error: "wrong_code" });
      return;
    }

    const resetToken = generateResetToken();
    await db
      .update(passwordResetCodes)
      .set({
        resetToken,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      })
      .where(eq(passwordResetCodes.id, record.id));

    res.json({ resetToken });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password-reset/complete — accepts {resetToken, newPassword},
// updates the Firebase user's password and revokes all existing sessions.
passwordResetRouter.post("/auth/password-reset/complete", async (req, res, next) => {
  try {
    const resetToken = String(req.body?.resetToken ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");

    if (!resetToken) {
      res.status(400).json({ error: "missing_token" });
      return;
    }
    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: "weak_password" });
      return;
    }

    const now = new Date();
    const rows = await db
      .select()
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.resetToken, resetToken),
          isNull(passwordResetCodes.consumedAt),
          gt(passwordResetCodes.resetTokenExpiresAt, now),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      res.status(400).json({ error: "invalid_or_expired_token" });
      return;
    }
    const record = rows[0];

    const fbUser = await firebaseAuth.getUserByEmail(record.email);
    // Mark email verified: receiving the OTP in their inbox and typing it back
    // is the same proof of email ownership that clicking the verification link
    // provides. Without this an unverified user who lost the verify email is
    // permanently locked out — they could reset the password but still couldn't
    // log in (the EmailNotVerifiedException check in the mobile client).
    await firebaseAuth.updateUser(fbUser.uid, {
      password: newPassword,
      emailVerified: true,
    });
    // Invalidate every existing ID token for this user so a stolen session
    // can't outlive a password reset.
    await firebaseAuth.revokeRefreshTokens(fbUser.uid);

    await db
      .update(passwordResetCodes)
      .set({ consumedAt: now })
      .where(eq(passwordResetCodes.id, record.id));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
