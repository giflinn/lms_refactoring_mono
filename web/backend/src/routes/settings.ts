import { Router } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
import {
  getSettingsMasked,
  isSecretKey,
  isValidSettingKey,
  setSetting,
} from "../services/appSettings";
import {
  getAssignmentConfig,
  setAssignmentConfig,
  VALID_STRATEGIES,
  type AssignmentStrategy,
} from "../services/managerAssignment";
import { chatBus } from "../services/chatBus";

export const settingsRouter = Router();

// GET /settings — admin + senior_manager fetch the full settings panel.
// Returns key/value pairs with defaults applied, so the UI always renders a
// stable shape even when no rows have been saved yet. Secret-marked keys
// (telegram bot token, webhook secret) are returned masked — see
// /telegram/settings for the dedicated admin-only Telegram surface.
settingsRouter.get(
  "/settings",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const settings = await getSettingsMasked();
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /settings — body is { settings: Record<string,string> }. Unknown keys
// are rejected (we don't want a typo creating an orphan row that lingers
// forever). Secret-marked keys are also rejected here — they have their own
// admin-only routes (e.g. /telegram/settings) that perform extra validation
// like calling getMe / setWebhook before persisting.
settingsRouter.patch(
  "/settings",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const updates = req.body?.settings;
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const entries = Object.entries(updates);
      for (const [key, value] of entries) {
        if (!isValidSettingKey(key)) {
          res.status(400).json({ error: "unknown_setting_key" });
          return;
        }
        if (isSecretKey(key)) {
          res.status(400).json({ error: "secret_key_not_writable_here" });
          return;
        }
        if (typeof value !== "string") {
          res.status(400).json({ error: "invalid_setting_value" });
          return;
        }
      }
      for (const [key, value] of entries) {
        await setSetting(key as never, value as string, actorId);
      }
      const settings = await getSettingsMasked();
      chatBus.emit("settings:update", { keys: entries.map(([k]) => k) });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);

// GET /settings/manager-assignment — combined read of both scopes plus the
// optional target user's display info, so the admin UI doesn't have to do
// a second lookup to render "Конкретный сотрудник: <name>".
settingsRouter.get(
  "/settings/manager-assignment",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const [onRegister, onDelete] = await Promise.all([
        getAssignmentConfig("on_register"),
        getAssignmentConfig("on_delete"),
      ]);

      const targetIds = [onRegister.targetUserId, onDelete.targetUserId].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      const uniqueIds = Array.from(new Set(targetIds));
      const targets =
        uniqueIds.length > 0
          ? await db
              .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
                role: users.role,
                avatarUrl: users.avatarUrl,
                deactivatedAt: users.deactivatedAt,
              })
              .from(users)
              .where(inArray(users.id, uniqueIds))
          : [];
      const targetById = new Map(targets.map((t) => [t.id, t]));

      function serializeScope(cfg: typeof onRegister) {
        const target = cfg.targetUserId
          ? targetById.get(cfg.targetUserId) ?? null
          : null;
        return {
          strategy: cfg.strategy,
          targetUserId: cfg.targetUserId,
          target: target
            ? {
                id: target.id,
                firstName: target.firstName,
                lastName: target.lastName,
                email: target.email,
                role: target.role,
                avatarUrl: target.avatarUrl,
                deactivated: target.deactivatedAt !== null,
              }
            : null,
        };
      }

      res.json({
        onRegister: serializeScope(onRegister),
        onDelete: serializeScope(onDelete),
      });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /settings/manager-assignment — atomic save of both scopes. Body:
//   { onRegister: { strategy, targetUserId? }, onDelete: { strategy, targetUserId? } }
// 'specific' strategy without an active staff target is rejected so the
// admin doesn't accidentally configure an immediate fallback path.
settingsRouter.put(
  "/settings/manager-assignment",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const onRegisterRaw = body.onRegister;
      const onDeleteRaw = body.onDelete;
      if (
        !onRegisterRaw ||
        typeof onRegisterRaw !== "object" ||
        Array.isArray(onRegisterRaw) ||
        !onDeleteRaw ||
        typeof onDeleteRaw !== "object" ||
        Array.isArray(onDeleteRaw)
      ) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }

      function parseScope(raw: unknown):
        | { strategy: AssignmentStrategy; targetUserId: string | null }
        | { error: string } {
        const r = raw as Record<string, unknown>;
        const strategyRaw = r.strategy;
        if (typeof strategyRaw !== "string") {
          return { error: "invalid_strategy" };
        }
        if (!VALID_STRATEGIES.has(strategyRaw as AssignmentStrategy)) {
          return { error: "invalid_strategy" };
        }
        const strategy = strategyRaw as AssignmentStrategy;
        let targetUserId: string | null = null;
        if (strategy === "specific") {
          const t = r.targetUserId;
          if (typeof t !== "string" || t.length === 0) {
            return { error: "specific_target_required" };
          }
          targetUserId = t;
        }
        return { strategy, targetUserId };
      }

      const reg = parseScope(onRegisterRaw);
      if ("error" in reg) {
        res.status(400).json({ error: reg.error });
        return;
      }
      const del = parseScope(onDeleteRaw);
      if ("error" in del) {
        res.status(400).json({ error: del.error });
        return;
      }

      // Verify the 'specific' targets are active staff before persisting.
      const checkIds = Array.from(
        new Set(
          [reg.targetUserId, del.targetUserId].filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          ),
        ),
      );
      if (checkIds.length > 0) {
        const found = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.id, checkIds),
              inArray(users.role, ["manager", "senior_manager", "admin"]),
              isNull(users.deactivatedAt),
            ),
          );
        const foundIds = new Set(found.map((u) => u.id));
        for (const id of checkIds) {
          if (!foundIds.has(id)) {
            res.status(400).json({ error: "target_not_active_staff" });
            return;
          }
        }
      }

      await Promise.all([
        setAssignmentConfig("on_register", reg, actorId),
        setAssignmentConfig("on_delete", del, actorId),
      ]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
