import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

// POST /auth/sync — find-or-create user record for the authenticated Firebase
// identity. Used by mobile registration (creates a `client` row on first call).
// Web admin login should NOT call this — it uses GET /me and rejects 404.
authRouter.post("/auth/sync", requireAuth, async (req, res, next) => {
  try {
    const uid = req.uid!;
    const email = req.email;

    if (!email) {
      res.status(400).json({ error: "email_missing_in_token" });
      return;
    }

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, uid))
      .limit(1);

    if (existing.length > 0) {
      res.json({ user: existing[0] });
      return;
    }

    const [created] = await db
      .insert(users)
      .values({ firebaseUid: uid, email })
      .returning();

    res.json({ user: created });
  } catch (err) {
    next(err);
  }
});

// GET /me — fetch the authenticated user's profile. 404 if no DB record
// (web uses this to block clients who only exist in Firebase).
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const uid = req.uid!;
    const result = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, uid))
      .limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: "user_not_registered" });
      return;
    }

    res.json({ user: result[0] });
  } catch (err) {
    next(err);
  }
});
