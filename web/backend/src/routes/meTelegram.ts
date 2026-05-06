// Mobile-facing Telegram endpoints. Three operations:
//
//   POST /me/telegram/link-token
//     Generates a single-use deep-link token + composes the t.me/<bot>?start=
//     URL. Mobile opens it via url_launcher; the bot's /start handler
//     consumes the token in Stage 3.
//
//   GET  /me/telegram
//     Returns linking state for the calling user — used in mobile profile +
//     order detail to decide which CTA to render ("Связать Telegram" vs
//     "Открыть Telegram").
//
//   POST /me/telegram/unlink
//     Mobile-initiated unlink — kicks the user from every active group and
//     clears the link. Symmetric inverse of the bot's /start linking.
//
// Bot username is read from app_settings (cached after first getMe). If the
// bot isn't configured yet, link-token returns 503 — mobile shows a "Свяжитесь
// с поддержкой" fallback.

import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";
import { db } from "../db";
import { users } from "../db/schema";
import { SETTING_KEYS, getSetting } from "../services/appSettings";
import { createLinkToken } from "../services/telegram/linkTokens";
import { revokeAllTelegramAccessForUser } from "../services/telegram/grants";

export const meTelegramRouter = Router();

meTelegramRouter.post(
  "/me/telegram/link-token",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const botUsername = (
        await getSetting(SETTING_KEYS.telegramBotUsername)
      ).trim();
      if (!botUsername) {
        res.status(503).json({ error: "bot_not_configured" });
        return;
      }
      const { token, expiresAt } = await createLinkToken(actorId);
      res.json({
        token,
        deepLink: `https://t.me/${botUsername}?start=${token}`,
        botUsername,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

meTelegramRouter.get(
  "/me/telegram",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const rows = await db
        .select({
          telegramUserId: users.telegramUserId,
          telegramUsername: users.telegramUsername,
          telegramFirstName: users.telegramFirstName,
          telegramLinkedAt: users.telegramLinkedAt,
        })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      const r = rows[0];
      if (!r || !r.telegramUserId) {
        res.json({ linked: false });
        return;
      }
      res.json({
        linked: true,
        telegramUserId: r.telegramUserId,
        telegramUsername: r.telegramUsername,
        telegramFirstName: r.telegramFirstName,
        telegramLinkedAt: r.telegramLinkedAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

meTelegramRouter.post(
  "/me/telegram/unlink",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      await revokeAllTelegramAccessForUser(actorId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
