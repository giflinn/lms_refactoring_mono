// Admin-only Telegram surface. Two concerns live here:
//   - bot credentials (token, username, webhook secret) — saved via
//     /telegram/settings, with the token validated against getMe before we
//     persist it. Saving (re-)initialises the bot in-process and registers
//     the webhook if BACKEND_PUBLIC_URL is configured.
//   - registered chats — list, manual add (paste chat_id), rename,
//     archive, manual resync.
//
// Read responses mask secret values. Writes accept plaintext but require
// admin role.

import { Router } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireStaffAdmin } from "../middleware/requireRole";
import { db } from "../db";
import { telegramGroups } from "../db/schema";
import {
  SETTING_KEYS,
  getSetting,
  getSettingsMasked,
  setSetting,
} from "../services/appSettings";
import {
  checkBotHealth,
  describeApiError,
  getBotInfo,
  getBotState,
  initBot,
  shutdownBot,
  webhookUrl,
} from "../services/telegram/bot";
import {
  findGroupByChatId,
  listGroups,
  probeChat,
  upsertGroup,
} from "../services/telegram/groups";
import { config } from "../config";

export const telegramAdminRouter = Router();

// GET /telegram/settings — bot config snapshot for the admin UI. Token is
// masked; everything else is plaintext.
telegramAdminRouter.get(
  "/telegram/settings",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const masked = await getSettingsMasked([
        SETTING_KEYS.telegramBotToken,
        SETTING_KEYS.telegramBotUsername,
        SETTING_KEYS.telegramWebhookSecret,
      ]);
      const state = getBotState();
      res.json({
        bot: {
          token: masked[SETTING_KEYS.telegramBotToken],
          username: masked[SETTING_KEYS.telegramBotUsername],
          webhookSecretMasked: masked[SETTING_KEYS.telegramWebhookSecret],
          webhookUrl: webhookUrl(),
          backendPublicUrlConfigured: Boolean(config.backendPublicUrl),
          status: state.status,
          statusMessage: state.status === "error" ? state.message : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /telegram/settings — body { token?: string }. Token === "" clears it
// (and shuts down the bot). Token === non-empty is validated via getMe before
// we persist; success → store + (re-)init bot + setWebhook.
telegramAdminRouter.patch(
  "/telegram/settings",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const body = req.body as { token?: unknown } | undefined;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      if (!("token" in body)) {
        res.status(400).json({ error: "no_changes" });
        return;
      }
      const token = body.token;
      if (typeof token !== "string") {
        res.status(400).json({ error: "invalid_token" });
        return;
      }
      const trimmed = token.trim();

      if (trimmed === "") {
        await setSetting(SETTING_KEYS.telegramBotToken, "", actorId);
        await setSetting(SETTING_KEYS.telegramBotUsername, "", actorId);
        // Webhook secret kept so re-installing the same bot reuses it.
        await shutdownBot();
      } else {
        // Validate before persisting so a typo'd token doesn't wipe a working
        // configuration. We do a one-off getMe via a throwaway Bot instance.
        let username: string;
        try {
          const { Bot } = await import("grammy");
          const probe = new Bot(trimmed);
          const me = await probe.api.getMe();
          username = me.username ?? "";
          if (!username) {
            res.status(400).json({ error: "bot_has_no_username" });
            return;
          }
        } catch (err) {
          res.status(400).json({
            error: "invalid_token",
            detail: describeApiError(err),
          });
          return;
        }
        await setSetting(SETTING_KEYS.telegramBotToken, trimmed, actorId);
        await setSetting(SETTING_KEYS.telegramBotUsername, username, actorId);
        await initBot();
      }

      const masked = await getSettingsMasked([
        SETTING_KEYS.telegramBotToken,
        SETTING_KEYS.telegramBotUsername,
        SETTING_KEYS.telegramWebhookSecret,
      ]);
      const state = getBotState();
      res.json({
        bot: {
          token: masked[SETTING_KEYS.telegramBotToken],
          username: masked[SETTING_KEYS.telegramBotUsername],
          webhookSecretMasked: masked[SETTING_KEYS.telegramWebhookSecret],
          webhookUrl: webhookUrl(),
          backendPublicUrlConfigured: Boolean(config.backendPublicUrl),
          status: state.status,
          statusMessage: state.status === "error" ? state.message : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /telegram/settings/check — re-runs getMe + getWebhookInfo without
// changing the saved token. Powers the "Перепроверить" button.
telegramAdminRouter.post(
  "/telegram/settings/check",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const health = await checkBotHealth();
      res.json({ health });
    } catch (err) {
      next(err);
    }
  },
);

// GET /telegram/groups — full list (incl. archived) for the admin Settings
// panel. Admin-only; bot creds + chat ids are sensitive admin surface.
telegramAdminRouter.get(
  "/telegram/groups",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const groups = await listGroups({ includeArchived: true });
      res.json({ groups: groups.map(serializeGroup) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /telegram/groups/picker — minimal payload for the product-form group
// dropdown. Returns only non-archived groups with bot_status='admin'.
// Available to staff-admin (senior_manager + admin) so non-admin staff can
// still create / edit Telegram-grant products.
telegramAdminRouter.get(
  "/telegram/groups/picker",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          id: telegramGroups.id,
          title: telegramGroups.title,
          chatType: telegramGroups.chatType,
        })
        .from(telegramGroups)
        .where(
          and(
            isNull(telegramGroups.archivedAt),
            eq(telegramGroups.botStatus, "admin"),
          ),
        )
        .orderBy(asc(telegramGroups.title));
      res.json({ groups: rows });
    } catch (err) {
      next(err);
    }
  },
);

// POST /telegram/groups — manual onboarding. Body { chatId: string }. Backend
// probes Telegram, requires bot to be at least a member, creates row.
telegramAdminRouter.post(
  "/telegram/groups",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!getBotInfo()) {
        res.status(409).json({ error: "bot_not_configured" });
        return;
      }
      const body = req.body as { chatId?: unknown } | undefined;
      const chatIdRaw = typeof body?.chatId === "string" ? body.chatId.trim() : "";
      if (!chatIdRaw) {
        res.status(400).json({ error: "invalid_chat_id" });
        return;
      }
      // Telegram chat IDs are integers. We store/transmit as text but reject
      // anything that isn't a parseable signed integer string here so a typo
      // surfaces immediately.
      if (!/^-?\d+$/.test(chatIdRaw)) {
        res.status(400).json({ error: "invalid_chat_id" });
        return;
      }

      let probe;
      try {
        probe = await probeChat(chatIdRaw);
      } catch (err) {
        res.status(400).json({
          error: "probe_failed",
          detail: describeApiError(err),
        });
        return;
      }

      if (probe.status === "chat_not_found") {
        res.status(404).json({ error: "chat_not_found" });
        return;
      }
      if (probe.status === "not_member") {
        res.status(400).json({ error: "bot_not_member" });
        return;
      }
      if (!probe.title || !probe.chatType) {
        res.status(400).json({ error: "chat_metadata_unavailable" });
        return;
      }

      const { row, created } = await upsertGroup({
        chatId: chatIdRaw,
        probe,
        createdByUserId: req.actorId ?? null,
      });
      res.status(created ? 201 : 200).json({ group: serializeGroup(row), created });
    } catch (err) {
      next(err);
    }
  },
);

// POST /telegram/groups/:id/resync — re-probes the chat and updates status +
// metadata. Used by the "Обновить" action per row.
telegramAdminRouter.post(
  "/telegram/groups/:id/resync",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const rows = await db
        .select()
        .from(telegramGroups)
        .where(eq(telegramGroups.id, id))
        .limit(1);
      if (rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const existing = rows[0];
      const probe = await probeChat(existing.chatId);
      const { row } = await upsertGroup({
        chatId: existing.chatId,
        probe,
        createdByUserId: existing.createdByUserId,
      });
      res.json({ group: serializeGroup(row) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /telegram/groups/:id — rename or update description. Only admin-
// editable fields. Bot status / chat type / chat_id are derived from
// Telegram and cannot be hand-edited.
telegramAdminRouter.patch(
  "/telegram/groups/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const body = req.body as
        | { title?: unknown; description?: unknown }
        | undefined;
      const update: { title?: string; description?: string | null } = {};
      if (body && typeof body.title === "string") {
        const t = body.title.trim();
        if (!t) {
          res.status(400).json({ error: "title_required" });
          return;
        }
        update.title = t;
      }
      if (body && (body.description === null || typeof body.description === "string")) {
        update.description =
          body.description === null
            ? null
            : (body.description as string).trim() || null;
      }
      if (Object.keys(update).length === 0) {
        res.status(400).json({ error: "no_changes" });
        return;
      }
      const rows = await db
        .update(telegramGroups)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(telegramGroups.id, id))
        .returning();
      if (rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ group: serializeGroup(rows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /telegram/groups/:id/archive  +  /unarchive. Soft-delete toggle.
// Stage 2 will refuse to archive a group that's still attached to active
// products; for now there's nothing to gate.
telegramAdminRouter.post(
  "/telegram/groups/:id/archive",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const rows = await db
        .update(telegramGroups)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(telegramGroups.id, req.params.id))
        .returning();
      if (rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ group: serializeGroup(rows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

telegramAdminRouter.post(
  "/telegram/groups/:id/unarchive",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const rows = await db
        .update(telegramGroups)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(telegramGroups.id, req.params.id))
        .returning();
      if (rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ group: serializeGroup(rows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

function serializeGroup(row: typeof telegramGroups.$inferSelect) {
  return {
    id: row.id,
    chatId: row.chatId,
    title: row.title,
    chatType: row.chatType,
    inviteUsername: row.inviteUsername,
    description: row.description,
    botStatus: row.botStatus,
    botStatusCheckedAt: row.botStatusCheckedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Helper used implicitly by findGroupByChatId callers — re-export to keep the
// service the single source of truth without forcing route files to import
// from /services directly.
export { findGroupByChatId };
