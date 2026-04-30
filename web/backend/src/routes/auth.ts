import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { avatarUpload, avatarUrlFor } from "../services/avatarUpload";
import {
  isValidEmail,
  isValidManagerCode,
  isValidPhone,
} from "../services/validation";

export const authRouter = Router();

const STAFF_ROLES = ["manager", "senior_manager", "admin"] as const;

// Look up the manager that should be linked to a new client. If a code was
// provided, find the staff user with that code; otherwise fall back to the
// oldest staff user (typically the seeded admin).
async function resolveManagerId(
  managerCode: string | null,
): Promise<{ managerId: string | null; error: string | null }> {
  if (managerCode) {
    if (!isValidManagerCode(managerCode)) {
      return { managerId: null, error: "invalid_manager_code_format" };
    }
    const found = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.managerCode, managerCode),
          inArray(users.role, [...STAFF_ROLES]),
        ),
      )
      .limit(1);
    if (found.length === 0) {
      return { managerId: null, error: "manager_code_not_found" };
    }
    return { managerId: found[0].id, error: null };
  }

  const fallback = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, [...STAFF_ROLES]))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return { managerId: fallback[0]?.id ?? null, error: null };
}

function serializeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    firebaseUid: u.firebaseUid,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    managerCode: u.managerCode,
    managerId: u.managerId,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

// POST /auth/sync — find-or-create the DB row for the authenticated Firebase
// identity. Mobile registration calls this with multipart/form-data carrying
// the rest of the profile + an optional avatar file. Subsequent calls (login
// flows on either client) just return the existing row without touching the
// extra fields.
authRouter.post(
  "/auth/sync",
  requireAuth,
  avatarUpload.single("avatar"),
  async (req, res, next) => {
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
        res.json({ user: serializeUser(existing[0]) });
        return;
      }

      // First-time registration: pull profile fields out of the multipart body.
      const body = req.body as Record<string, string | undefined>;
      const firstName = (body.firstName ?? "").trim();
      const lastName = (body.lastName ?? "").trim();
      const phone = (body.phone ?? "").trim();
      const managerCodeInput = (body.managerCode ?? "").trim() || null;
      const termsAccepted = body.termsAccepted === "true";

      if (!firstName || !lastName) {
        res.status(400).json({ error: "name_required" });
        return;
      }
      if (!phone || !isValidPhone(phone)) {
        res.status(400).json({ error: "invalid_phone" });
        return;
      }
      if (!termsAccepted) {
        res.status(400).json({ error: "terms_not_accepted" });
        return;
      }

      const { managerId, error: managerErr } =
        await resolveManagerId(managerCodeInput);
      if (managerErr) {
        res.status(400).json({ error: managerErr });
        return;
      }

      const avatarUrl = req.file ? avatarUrlFor(req.file.filename) : null;

      const [created] = await db
        .insert(users)
        .values({
          firebaseUid: uid,
          email,
          role: "client",
          firstName,
          lastName,
          phone,
          managerId,
          avatarUrl,
          termsAcceptedAt: new Date(),
        })
        .returning();

      res.json({ user: serializeUser(created) });
    } catch (err) {
      next(err);
    }
  },
);

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

    res.json({ user: serializeUser(result[0]) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/manager-code-valid?code=123456 — lightweight validator the mobile
// client can call before submitting registration so the user gets fast
// feedback. No auth required (the code itself is the secret); rate-limited
// loosely by client UX (only called on field blur).
authRouter.get("/auth/manager-code-valid", async (req, res, next) => {
  try {
    const code = String(req.query.code ?? "").trim();
    if (!isValidManagerCode(code)) {
      res.json({ valid: false });
      return;
    }
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.managerCode, code),
          inArray(users.role, [...STAFF_ROLES]),
        ),
      )
      .limit(1);
    res.json({ valid: found.length > 0 });
  } catch (err) {
    next(err);
  }
});
