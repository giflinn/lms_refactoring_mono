import { Router } from "express";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  telegramGroups,
  telegramMemberships,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import {
  avatarUpload,
  avatarUrlFor,
  managerAvatarUpload,
  persistManagerAvatar,
} from "../services/avatarUpload";
import { pickManagerForRegistration } from "../services/managerAssignment";
import { kickUser } from "../services/telegram/links";
import {
  isValidEmail,
  isValidManagerCode,
  isValidPhone,
} from "../services/validation";

export const authRouter = Router();

const STAFF_ROLES = ["manager", "senior_manager", "admin"] as const;

// Look up the manager that should be linked to a new client. If a code was
// provided, find the staff user with that code; otherwise delegate to the
// admin-configurable manager-assignment strategy
// (see services/managerAssignment.ts).
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
          isNull(users.deactivatedAt),
        ),
      )
      .limit(1);
    if (found.length === 0) {
      return { managerId: null, error: "manager_code_not_found" };
    }
    return { managerId: found[0].id, error: null };
  }

  const managerId = await pickManagerForRegistration();
  return { managerId, error: null };
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
    comment: u.comment,
    managerCode: u.managerCode,
    managerId: u.managerId,
    avatarUrl: u.avatarUrl,
    clientCategory: u.clientCategory,
    birthDate: u.birthDate,
    // Mobile checks selfDeletedAt to show the "Восстановить аккаунт?" prompt
    // after a sign-in that lands on a self-deleted DB row. Null on normal
    // accounts.
    selfDeletedAt: u.selfDeletedAt,
    createdAt: u.createdAt,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX_LEN = 50;

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

// PATCH /me — partial profile update for the authenticated user. Multipart
// so an avatar file can ride along. All fields are optional; only those
// present in the body get touched. Used by the mobile "Личные данные" screen.
authRouter.patch(
  "/me",
  requireAuth,
  managerAvatarUpload.single("avatar"),
  async (req, res, next) => {
    try {
      const uid = req.uid!;
      const body = req.body as Record<string, string | undefined>;
      const patch: Partial<typeof users.$inferInsert> = {};

      if (body.firstName !== undefined) {
        const v = body.firstName.trim();
        if (!v || v.length > NAME_MAX_LEN) {
          res.status(400).json({ error: "invalid_first_name" });
          return;
        }
        patch.firstName = v;
      }
      if (body.lastName !== undefined) {
        const v = body.lastName.trim();
        if (!v || v.length > NAME_MAX_LEN) {
          res.status(400).json({ error: "invalid_last_name" });
          return;
        }
        patch.lastName = v;
      }
      if (body.phone !== undefined) {
        const v = body.phone.trim();
        if (!v || !isValidPhone(v)) {
          res.status(400).json({ error: "invalid_phone" });
          return;
        }
        patch.phone = v;
      }
      if (body.birthDate !== undefined) {
        const v = body.birthDate.trim();
        if (v === "") {
          patch.birthDate = null;
        } else {
          if (!DATE_RE.test(v)) {
            res.status(400).json({ error: "invalid_birth_date" });
            return;
          }
          // Reject future dates and absurdly old ones.
          const parsed = new Date(`${v}T00:00:00Z`);
          if (Number.isNaN(parsed.getTime())) {
            res.status(400).json({ error: "invalid_birth_date" });
            return;
          }
          const year = parsed.getUTCFullYear();
          if (year < 1900 || parsed.getTime() > Date.now()) {
            res.status(400).json({ error: "invalid_birth_date" });
            return;
          }
          patch.birthDate = v;
        }
      }
      if (req.file) {
        patch.avatarUrl = await persistManagerAvatar(uid, req.file);
      }

      // Block edits on self-deleted accounts — they must call
      // /auth/restore-me first. Read the row once and reuse it for the
      // no-op echo branch below.
      const current = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, uid))
        .limit(1);
      if (current.length === 0) {
        res.status(404).json({ error: "user_not_registered" });
        return;
      }
      if (current[0].selfDeletedAt) {
        res.status(403).json({ error: "account_self_deleted" });
        return;
      }

      // Nothing to change → just echo current state. Lets the mobile page
      // treat "save with no edits" as a no-op without a special branch.
      if (Object.keys(patch).length === 0) {
        res.json({ user: serializeUser(current[0]) });
        return;
      }

      const updated = await db
        .update(users)
        .set(patch)
        .where(eq(users.firebaseUid, uid))
        .returning();
      res.json({ user: serializeUser(updated[0]) });
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

// DELETE /me — client self-service account deletion. Soft-delete: scrubs PII
// (firstName/lastName/phone/avatarUrl/birthDate + telegram link), sets
// selfDeletedAt, cancels future coach bookings, kicks the user from any
// Telegram channels via the bot. firebaseUid and email are kept so the user
// can sign in again and tap "Восстановить аккаунт" → POST /auth/restore-me.
//
// Required by Google Play (in-app account deletion). Staff users cannot
// self-delete from here — they're managed via admin endpoints.
authRouter.delete("/me", requireAuth, async (req, res, next) => {
  try {
    const uid = req.uid!;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, uid))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "user_not_registered" });
      return;
    }
    if (user.role !== "client") {
      res.status(403).json({ error: "staff_cannot_self_delete" });
      return;
    }
    // Idempotent — repeated call after a successful delete is a no-op.
    if (user.selfDeletedAt) {
      res.json({ ok: true });
      return;
    }

    // Snapshot the membership rows + chat IDs we'll need to kick from after
    // the transaction. The bot's banChatMember call talks to Telegram's API
    // — we run it outside the DB transaction so a Telegram outage doesn't
    // roll back the deletion.
    const activeMemberships = await db
      .select({
        id: telegramMemberships.id,
        chatId: telegramGroups.chatId,
      })
      .from(telegramMemberships)
      .innerJoin(
        telegramGroups,
        eq(telegramGroups.id, telegramMemberships.telegramGroupId),
      )
      .where(
        and(
          eq(telegramMemberships.userId, user.id),
          inArray(telegramMemberships.status, ["pending", "joined"]),
        ),
      );

    const tgUserIdForKick =
      user.telegramUserId !== null ? Number(user.telegramUserId) : null;
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          firstName: "",
          lastName: "",
          phone: null,
          avatarUrl: null,
          birthDate: null,
          telegramUserId: null,
          telegramUsername: null,
          telegramFirstName: null,
          telegramLinkedAt: null,
          selfDeletedAt: now,
        })
        .where(eq(users.id, user.id));

      // Free up future slot bookings. Past bookings stay 'active' so they
      // remain in the manager's history view.
      await tx
        .update(coachBookings)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(
          and(
            eq(coachBookings.clientId, user.id),
            eq(coachBookings.status, "active"),
            gt(coachBookings.endsAt, now),
          ),
        );

      if (activeMemberships.length > 0) {
        await tx
          .update(telegramMemberships)
          .set({ status: "kicked", kickedAt: now, updatedAt: now })
          .where(
            inArray(
              telegramMemberships.id,
              activeMemberships.map((m) => m.id),
            ),
          );
      }
    });

    // Best-effort Telegram kick. kickUser swallows "user not in chat" cases
    // and only logs hard failures.
    if (tgUserIdForKick !== null && Number.isFinite(tgUserIdForKick)) {
      for (const m of activeMemberships) {
        await kickUser({
          chatId: m.chatId,
          telegramUserId: tgUserIdForKick,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/restore-me — undo a self-delete. The user signs in normally
// (their Firebase account stays enabled across deletion), GET /me returns
// selfDeletedAt non-null, mobile shows "Восстановить аккаунт?" → this clears
// the marker. firstName/lastName/phone were scrubbed and stay empty — mobile
// routes the restored user through the existing complete-profile page so
// they re-enter them.
authRouter.post("/auth/restore-me", requireAuth, async (req, res, next) => {
  try {
    const uid = req.uid!;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, uid))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "user_not_registered" });
      return;
    }
    if (!user.selfDeletedAt) {
      // Already active — return the row so the caller can proceed without a
      // separate GET /me roundtrip.
      res.json({ user: serializeUser(user) });
      return;
    }
    const [restored] = await db
      .update(users)
      .set({ selfDeletedAt: null })
      .where(eq(users.id, user.id))
      .returning();
    res.json({ user: serializeUser(restored) });
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
          isNull(users.deactivatedAt),
        ),
      )
      .limit(1);
    res.json({ valid: found.length > 0 });
  } catch (err) {
    next(err);
  }
});
