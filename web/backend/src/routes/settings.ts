import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
import {
  getSettings,
  isValidSettingKey,
  setSetting,
} from "../services/appSettings";
import { chatBus } from "../services/chatBus";

export const settingsRouter = Router();

// GET /settings — admin + senior_manager fetch the full settings panel.
// Returns key/value pairs with defaults applied, so the UI always renders a
// stable shape even when no rows have been saved yet.
settingsRouter.get(
  "/settings",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const settings = await getSettings();
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /settings — body is { settings: Record<string,string> }. Unknown keys
// are rejected (we don't want a typo creating an orphan row that lingers
// forever).
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
        if (typeof value !== "string") {
          res.status(400).json({ error: "invalid_setting_value" });
          return;
        }
      }
      for (const [key, value] of entries) {
        await setSetting(key as never, value as string, actorId);
      }
      const settings = await getSettings();
      chatBus.emit("settings:update", { keys: entries.map(([k]) => k) });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);
