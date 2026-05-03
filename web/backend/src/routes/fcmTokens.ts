import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userFcmTokens } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";

export const fcmTokensRouter = Router();

const VALID_PLATFORMS = new Set(["ios", "android"]);

// POST /me/fcm-tokens — register/refresh a device token. The mobile app calls
// this on login and whenever firebase_messaging hands out a rotated token.
// Upsert by (token) so re-registering the same device updates only
// last_seen_at; if the same token shows up under a different user_id (e.g.
// account switch on the same device), the row migrates.
fcmTokensRouter.post(
  "/me/fcm-tokens",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const token = String(req.body?.token ?? "").trim();
      const platform = String(req.body?.platform ?? "");
      if (!token) {
        res.status(400).json({ error: "missing_token" });
        return;
      }
      if (!VALID_PLATFORMS.has(platform)) {
        res.status(400).json({ error: "invalid_platform" });
        return;
      }
      const now = new Date();
      await db
        .insert(userFcmTokens)
        .values({
          userId: actorId,
          token,
          platform: platform as "ios" | "android",
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: userFcmTokens.token,
          set: { userId: actorId, lastSeenAt: now },
        });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /me/fcm-tokens — called on sign-out so the device stops getting
// pushes. Body { token } so we delete only the device the user is on, not
// any other devices the same account is signed in to.
fcmTokensRouter.delete(
  "/me/fcm-tokens",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const token = String(req.body?.token ?? "").trim();
      if (!token) {
        res.status(400).json({ error: "missing_token" });
        return;
      }
      await db
        .delete(userFcmTokens)
        .where(
          and(
            eq(userFcmTokens.token, token),
            eq(userFcmTokens.userId, actorId),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
