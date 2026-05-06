// Single-use deep-link tokens that bridge mobile → bot. The mobile app calls
// POST /me/telegram/link-token, gets `{ token, deepLink }`, opens the deep
// link in the Telegram app. The bot's /start handler picks the token off the
// command argument, looks it up here, and links the user.
//
// Tokens are 16 random bytes encoded base64url → 22 ASCII chars, well within
// Telegram's 64-char limit on the /start parameter and well outside the
// "guess in a brute-force window" range. Single-use + 15-min TTL.
//
// We do NOT delete consumed tokens immediately so a quick repeat tap from
// the mobile app (say the user backed out of Telegram and tried again) hits
// a clean "already used" error instead of the much vaguer "invalid token".
// A daily cron (Stage 4) purges tokens older than 24h.

import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { telegramLinkTokens } from "../../db/schema";

export const TOKEN_TTL_MS = 15 * 60 * 1000;

export type LinkTokenResult = {
  token: string;
  expiresAt: Date;
};

export async function createLinkToken(userId: string): Promise<LinkTokenResult> {
  const token = randomBytes(16).toString("base64url"); // 22 chars
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  await db.insert(telegramLinkTokens).values({
    token,
    userId,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

// Looks up a token, validates it, marks consumed in one transaction. Returns
// the userId on success or a typed reason on failure.
export type ConsumeOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

export async function consumeLinkToken(
  token: string,
): Promise<ConsumeOutcome> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(telegramLinkTokens)
      .where(eq(telegramLinkTokens.token, token))
      .limit(1);
    if (rows.length === 0) return { ok: false, reason: "not_found" };
    const row = rows[0];
    if (row.consumedAt) return { ok: false, reason: "already_used" };
    if (row.expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    await tx
      .update(telegramLinkTokens)
      .set({ consumedAt: new Date() })
      .where(eq(telegramLinkTokens.token, token));
    return { ok: true, userId: row.userId };
  });
}

// Best-effort cleanup helper called by the Stage 4 cron — exposed here so
// the schema knowledge stays in one place. Drops every row whose 15-min
// validity window expired more than a day ago, regardless of whether it
// was consumed (rows older than 24h carry no audit value).
export async function purgeStaleLinkTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(telegramLinkTokens)
    .where(lt(telegramLinkTokens.expiresAt, cutoff))
    .returning({ token: telegramLinkTokens.token });
  return deleted.length;
}

