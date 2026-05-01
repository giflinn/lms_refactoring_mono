import { Router } from "express";
import { and, asc, count, desc, eq, inArray, isNull, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
import { firebaseAuth } from "../firebase";
import { generateUniqueManagerCode } from "../services/managerCode";
import { generateStrongPassword } from "../services/passwordGen";
import { sendStaffInvite, sendStaffPasswordReset } from "../services/mailer";
import {
  isValidEmail,
  isValidPhone,
} from "../services/validation";

export const managersRouter = Router();

const STAFF_ROLES = ["manager", "senior_manager", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
const CREATABLE_ROLES = ["manager", "senior_manager"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

function serialize(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    comment: u.comment,
    managerCode: u.managerCode,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

// What roles the current actor is allowed to see in the staff list. Senior
// managers only see ordinary managers (the people they can act on); admins
// see all staff.
function visibleRoles(actorRole: StaffRole): StaffRole[] {
  if (actorRole === "admin") return [...STAFF_ROLES];
  return ["manager"];
}

// Whether actor may create / update / reset / deactivate the given target row.
// Returns an error code on rejection or null on success. We never act on self
// through this endpoint (self-edit lives elsewhere) and senior managers may
// only touch role=manager targets.
function canActOnTarget(
  actorId: string,
  actorRole: StaffRole,
  target: { id: string; role: StaffRole },
): string | null {
  if (target.id === actorId) return "cannot_act_on_self";
  if (actorRole === "admin") return null;
  // actorRole === senior_manager
  if (target.role !== "manager") return "forbidden_role_target";
  return null;
}

// GET /managers?q=&page=&pageSize=
managersRouter.get(
  "/managers",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorRole = req.actorRole as StaffRole;
      const q = String(req.query.q ?? "").trim();
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize ?? "10") || 10),
      );

      const roles = visibleRoles(actorRole);
      const conditions = [
        inArray(users.role, roles),
        isNull(users.deactivatedAt),
      ];
      if (q) {
        const like = `%${q}%`;
        conditions.push(
          or(
            ilike(users.firstName, like),
            ilike(users.lastName, like),
            ilike(users.email, like),
            ilike(users.phone, like),
          )!,
        );
      }
      const where = and(...conditions);

      const [{ total }] = await db
        .select({ total: count() })
        .from(users)
        .where(where);

      const rows = await db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({
        managers: rows.map(serialize),
        page,
        pageSize,
        total: Number(total),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /managers — create staff user. Generates Firebase user with random
// password, stores DB row, sends invite email. role=manager unless caller is
// admin and explicitly toggled "Главный менеджер" (→ senior_manager).
managersRouter.post(
  "/managers",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorRole = req.actorRole as StaffRole;
      const body = req.body as Record<string, unknown>;

      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const phone = String(body.phone ?? "").trim();
      const comment = body.comment != null ? String(body.comment).trim() : null;
      const isSenior = body.isSenior === true || body.isSenior === "true";

      if (!firstName || !lastName) {
        res.status(400).json({ error: "name_required" });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: "invalid_email" });
        return;
      }
      if (!isValidPhone(phone)) {
        res.status(400).json({ error: "invalid_phone" });
        return;
      }

      const targetRole: CreatableRole = isSenior ? "senior_manager" : "manager";
      if (targetRole === "senior_manager" && actorRole !== "admin") {
        res.status(403).json({ error: "forbidden_role_target" });
        return;
      }

      // Pre-check email is not already in use in our DB (Firebase will also
      // reject; this gives a cleaner error before we even touch Firebase).
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "email_already_exists" });
        return;
      }

      const password = generateStrongPassword();
      const managerCode = await generateUniqueManagerCode();

      // Create Firebase user first — it owns the credential. If our DB insert
      // fails afterwards we delete the Firebase user to avoid orphans.
      let firebaseUid: string;
      try {
        const fbUser = await firebaseAuth.createUser({
          email,
          password,
          emailVerified: true,
          displayName: `${firstName} ${lastName}`,
        });
        firebaseUid = fbUser.uid;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "auth/email-already-exists") {
          res.status(409).json({ error: "email_already_exists" });
          return;
        }
        throw err;
      }

      let createdRow: typeof users.$inferSelect;
      try {
        const [row] = await db
          .insert(users)
          .values({
            firebaseUid,
            email,
            role: targetRole,
            firstName,
            lastName,
            phone,
            comment,
            managerCode,
          })
          .returning();
        createdRow = row;
      } catch (err) {
        await firebaseAuth.deleteUser(firebaseUid).catch(() => {});
        throw err;
      }

      // Send invite email outside the critical path — log on failure but still
      // return success so the admin can resend later via reset-password.
      try {
        await sendStaffInvite(email, password);
      } catch (mailErr) {
        console.error(
          "[managers] invite email failed for",
          email,
          mailErr,
        );
      }

      res.json({ manager: serialize(createdRow) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /managers/:id — update profile fields. Only admin may change role
// (toggle Главный менеджер). Senior managers can only edit role=manager.
managersRouter.patch(
  "/managers/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const targetId = req.params.id;
      const body = req.body as Record<string, unknown>;

      const targetRows = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (targetRows.length === 0 || targetRows[0].deactivatedAt) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }
      const target = targetRows[0];
      if (!STAFF_ROLES.includes(target.role as StaffRole)) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }

      const guardErr = canActOnTarget(actorId, actorRole, {
        id: target.id,
        role: target.role as StaffRole,
      });
      if (guardErr) {
        res.status(guardErr === "cannot_act_on_self" ? 400 : 403).json({
          error: guardErr,
        });
        return;
      }

      const patch: Partial<typeof users.$inferInsert> = {};

      if (body.firstName !== undefined) {
        const v = String(body.firstName).trim();
        if (!v) {
          res.status(400).json({ error: "name_required" });
          return;
        }
        patch.firstName = v;
      }
      if (body.lastName !== undefined) {
        const v = String(body.lastName).trim();
        if (!v) {
          res.status(400).json({ error: "name_required" });
          return;
        }
        patch.lastName = v;
      }
      if (body.email !== undefined) {
        const v = String(body.email).trim().toLowerCase();
        if (!isValidEmail(v)) {
          res.status(400).json({ error: "invalid_email" });
          return;
        }
        if (v !== target.email) {
          const dup = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, v))
            .limit(1);
          if (dup.length > 0) {
            res.status(409).json({ error: "email_already_exists" });
            return;
          }
          patch.email = v;
        }
      }
      if (body.phone !== undefined) {
        const v = String(body.phone).trim();
        if (!isValidPhone(v)) {
          res.status(400).json({ error: "invalid_phone" });
          return;
        }
        patch.phone = v;
      }
      if (body.comment !== undefined) {
        const v = body.comment === null ? null : String(body.comment).trim();
        patch.comment = v ? v : null;
      }
      if (body.isSenior !== undefined) {
        if (actorRole !== "admin") {
          res.status(403).json({ error: "forbidden_role_target" });
          return;
        }
        // Never demote/promote admin via this toggle.
        if (target.role === "admin") {
          res.status(403).json({ error: "forbidden_role_target" });
          return;
        }
        const truthy = body.isSenior === true || body.isSenior === "true";
        patch.role = truthy ? "senior_manager" : "manager";
      }

      if (Object.keys(patch).length === 0) {
        res.json({ manager: serialize(target) });
        return;
      }

      // Mirror email change to Firebase. Done before DB so a Firebase failure
      // doesn't leave the two stores out of sync.
      if (patch.email && patch.email !== target.email) {
        try {
          await firebaseAuth.updateUser(target.firebaseUid, {
            email: patch.email,
          });
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "auth/email-already-exists") {
            res.status(409).json({ error: "email_already_exists" });
            return;
          }
          throw err;
        }
      }

      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, targetId))
        .returning();

      res.json({ manager: serialize(updated) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /managers/:id/reset-password — generate a new password, push it to
// Firebase, kill all existing sessions, email it to the manager.
managersRouter.post(
  "/managers/:id/reset-password",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const targetId = req.params.id;

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (rows.length === 0 || rows[0].deactivatedAt) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }
      const target = rows[0];
      if (!STAFF_ROLES.includes(target.role as StaffRole)) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }

      const guardErr = canActOnTarget(actorId, actorRole, {
        id: target.id,
        role: target.role as StaffRole,
      });
      if (guardErr) {
        res.status(guardErr === "cannot_act_on_self" ? 400 : 403).json({
          error: guardErr,
        });
        return;
      }

      const password = generateStrongPassword();
      await firebaseAuth.updateUser(target.firebaseUid, { password });
      await firebaseAuth.revokeRefreshTokens(target.firebaseUid);

      try {
        await sendStaffPasswordReset(target.email, password);
      } catch (mailErr) {
        console.error(
          "[managers] reset email failed for",
          target.email,
          mailErr,
        );
        res.status(500).json({ error: "email_send_failed" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /managers/:id — soft-delete (deactivate) and redistribute the
// manager's clients evenly among other active staff.
managersRouter.delete(
  "/managers/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const targetId = req.params.id;

      const targetRows = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (targetRows.length === 0 || targetRows[0].deactivatedAt) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }
      const target = targetRows[0];
      if (!STAFF_ROLES.includes(target.role as StaffRole)) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }

      const guardErr = canActOnTarget(actorId, actorRole, {
        id: target.id,
        role: target.role as StaffRole,
      });
      if (guardErr) {
        const status = guardErr === "cannot_act_on_self" ? 400 : 403;
        const code =
          guardErr === "cannot_act_on_self" ? "cannot_deactivate_self" : guardErr;
        res.status(status).json({ error: code });
        return;
      }

      await db.transaction(async (tx) => {
        const others = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.role, [...STAFF_ROLES]),
              isNull(users.deactivatedAt),
              sql`${users.id} <> ${targetId}`,
            ),
          )
          .orderBy(asc(users.createdAt));

        if (others.length === 0) {
          throw new TaggedError("last_active_staff");
        }

        const clientsToReassign = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.managerId, targetId));

        for (let i = 0; i < clientsToReassign.length; i++) {
          const newManager = others[i % others.length];
          await tx
            .update(users)
            .set({ managerId: newManager.id })
            .where(eq(users.id, clientsToReassign[i].id));
        }

        await tx
          .update(users)
          .set({ deactivatedAt: new Date() })
          .where(eq(users.id, targetId));
      });

      // Best-effort: lock the Firebase account out. Failing here doesn't undo
      // the deactivation — log and move on.
      try {
        await firebaseAuth.updateUser(target.firebaseUid, { disabled: true });
        await firebaseAuth.revokeRefreshTokens(target.firebaseUid);
      } catch (fbErr) {
        console.error(
          "[managers] firebase disable failed for",
          target.firebaseUid,
          fbErr,
        );
      }

      res.json({ ok: true });
    } catch (err) {
      if (err instanceof TaggedError) {
        res.status(409).json({ error: err.code });
        return;
      }
      next(err);
    }
  },
);

class TaggedError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
