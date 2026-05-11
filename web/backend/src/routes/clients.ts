import { Router } from "express";
import {
  alias,
} from "drizzle-orm/pg-core";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import { users, type clientCategoryEnum } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaff } from "../middleware/requireRole";
import { firebaseAuth } from "../firebase";
import { isValidPhone } from "../services/validation";

export const clientsRouter = Router();

type StaffRole = "manager" | "senior_manager" | "admin";
type ClientCategory = (typeof clientCategoryEnum.enumValues)[number];
const VALID_CATEGORIES: ReadonlySet<ClientCategory> = new Set([
  "new",
  "regular",
  "vip",
]);

// ISO date YYYY-MM-DD. We store as `date`, the API exchanges plain strings.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const managers = alias(users, "managers");

type ClientRow = typeof users.$inferSelect;
type ManagerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

function serialize(c: ClientRow, m: ManagerSummary | null) {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    avatarUrl: c.avatarUrl,
    comment: c.comment,
    birthDate: c.birthDate,
    clientCategory: c.clientCategory,
    managerId: c.managerId,
    manager: m,
    deactivatedAt: c.deactivatedAt,
    selfDeletedAt: c.selfDeletedAt,
    createdAt: c.createdAt,
  };
}

// Manager-role actors only see their own clients. Senior managers and admins
// see every active client.
function scopeFilter(actorId: string, actorRole: StaffRole): SQL | undefined {
  if (actorRole === "manager") return eq(users.managerId, actorId);
  return undefined;
}

// GET /clients?q=&page=&pageSize=&managerId=&category=
clientsRouter.get(
  "/clients",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const q = String(req.query.q ?? "").trim();
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize ?? "10") || 10),
      );
      const managerIdFilter =
        typeof req.query.managerId === "string" && req.query.managerId
          ? String(req.query.managerId)
          : null;
      const categoryFilterRaw =
        typeof req.query.category === "string" && req.query.category
          ? String(req.query.category)
          : null;
      const categoryFilter =
        categoryFilterRaw && VALID_CATEGORIES.has(categoryFilterRaw as ClientCategory)
          ? (categoryFilterRaw as ClientCategory)
          : null;

      const statusRaw = String(req.query.status ?? "active").toLowerCase();
      const status: "active" | "deactivated" | "all" =
        statusRaw === "deactivated" || statusRaw === "all"
          ? statusRaw
          : "active";

      const conditions: SQL[] = [eq(users.role, "client")];
      if (status === "active") {
        conditions.push(isNull(users.deactivatedAt));
      } else if (status === "deactivated") {
        conditions.push(isNotNull(users.deactivatedAt));
      }
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
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
      if (managerIdFilter) conditions.push(eq(users.managerId, managerIdFilter));
      if (categoryFilter) conditions.push(eq(users.clientCategory, categoryFilter));

      const where = and(...conditions);

      const [{ total }] = await db
        .select({ total: count() })
        .from(users)
        .where(where);

      const rows = await db
        .select({
          client: users,
          manager: {
            id: managers.id,
            firstName: managers.firstName,
            lastName: managers.lastName,
            email: managers.email,
            avatarUrl: managers.avatarUrl,
          },
        })
        .from(users)
        .leftJoin(managers, eq(managers.id, users.managerId))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({
        clients: rows.map((r) =>
          serialize(r.client, r.manager?.id ? (r.manager as ManagerSummary) : null),
        ),
        page,
        pageSize,
        total: Number(total),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /clients/:id — single client lookup. Used by the mobile staff app
// when arriving at a client profile from a context where we don't already
// have the row in cache (e.g. tapping the header on a chat conversation).
clientsRouter.get(
  "/clients/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const targetId = req.params.id;

      const rows = await db
        .select({
          client: users,
          manager: {
            id: managers.id,
            firstName: managers.firstName,
            lastName: managers.lastName,
            email: managers.email,
            avatarUrl: managers.avatarUrl,
          },
        })
        .from(users)
        .leftJoin(managers, eq(managers.id, users.managerId))
        .where(eq(users.id, targetId))
        .limit(1);
      if (rows.length === 0 || rows[0].client.role !== "client") {
        res.status(404).json({ error: "client_not_found" });
        return;
      }
      const target = rows[0].client;
      if (actorRole === "manager" && target.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      res.json({
        client: serialize(
          target,
          rows[0].manager?.id ? (rows[0].manager as ManagerSummary) : null,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /clients/:id — update phone / comment / birthDate / clientCategory /
// managerId. Email and name are not editable (Figma drawer doesn't expose them
// and we treat email as identity).
clientsRouter.patch(
  "/clients/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const targetId = req.params.id;
      const body = req.body as Record<string, unknown>;

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (rows.length === 0 || rows[0].deactivatedAt || rows[0].role !== "client") {
        res.status(404).json({ error: "client_not_found" });
        return;
      }
      const target = rows[0];

      if (actorRole === "manager" && target.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const patch: Partial<typeof users.$inferInsert> = {};

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
      if (body.birthDate !== undefined) {
        if (body.birthDate === null || body.birthDate === "") {
          patch.birthDate = null;
        } else {
          const v = String(body.birthDate).trim();
          if (!DATE_RE.test(v)) {
            res.status(400).json({ error: "invalid_birth_date" });
            return;
          }
          patch.birthDate = v;
        }
      }
      if (body.clientCategory !== undefined) {
        const v = String(body.clientCategory);
        if (!VALID_CATEGORIES.has(v as ClientCategory)) {
          res.status(400).json({ error: "invalid_client_category" });
          return;
        }
        patch.clientCategory = v as ClientCategory;
      }
      if (body.managerId !== undefined) {
        // Only senior_manager + admin may reassign clients between managers.
        if (actorRole === "manager") {
          res.status(403).json({ error: "forbidden_assignment" });
          return;
        }
        if (body.managerId === null || body.managerId === "") {
          res.status(400).json({ error: "manager_required" });
          return;
        }
        const newManagerId = String(body.managerId);
        const mgrRows = await db
          .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
          .from(users)
          .where(eq(users.id, newManagerId))
          .limit(1);
        if (
          mgrRows.length === 0 ||
          mgrRows[0].deactivatedAt ||
          (mgrRows[0].role !== "manager" &&
            mgrRows[0].role !== "senior_manager" &&
            mgrRows[0].role !== "admin")
        ) {
          res.status(400).json({ error: "manager_not_found" });
          return;
        }
        patch.managerId = newManagerId;
      }

      if (Object.keys(patch).length === 0) {
        const [{ client, manager }] = await db
          .select({
            client: users,
            manager: {
              id: managers.id,
              firstName: managers.firstName,
              lastName: managers.lastName,
              email: managers.email,
              avatarUrl: managers.avatarUrl,
            },
          })
          .from(users)
          .leftJoin(managers, eq(managers.id, users.managerId))
          .where(eq(users.id, target.id))
          .limit(1);
        res.json({
          client: serialize(client, manager?.id ? (manager as ManagerSummary) : null),
        });
        return;
      }

      await db.update(users).set(patch).where(eq(users.id, target.id));

      const [{ client, manager }] = await db
        .select({
          client: users,
          manager: {
            id: managers.id,
            firstName: managers.firstName,
            lastName: managers.lastName,
            email: managers.email,
            avatarUrl: managers.avatarUrl,
          },
        })
        .from(users)
        .leftJoin(managers, eq(managers.id, users.managerId))
        .where(eq(users.id, target.id))
        .limit(1);

      res.json({
        client: serialize(client, manager?.id ? (manager as ManagerSummary) : null),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /clients/:id — soft-delete. Mirrors the manager flow: set
// deactivatedAt, disable Firebase user, revoke refresh tokens.
clientsRouter.delete(
  "/clients/:id",
  requireAuth,
  requireStaff,
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
      if (rows.length === 0 || rows[0].deactivatedAt || rows[0].role !== "client") {
        res.status(404).json({ error: "client_not_found" });
        return;
      }
      const target = rows[0];

      if (actorRole === "manager" && target.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      await db
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, target.id));

      try {
        await firebaseAuth.updateUser(target.firebaseUid, { disabled: true });
        await firebaseAuth.revokeRefreshTokens(target.firebaseUid);
      } catch (fbErr) {
        console.error(
          "[clients] firebase disable failed for",
          target.firebaseUid,
          fbErr,
        );
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /clients/:id/reactivate — undo a soft-delete and re-enable Firebase.
clientsRouter.post(
  "/clients/:id/reactivate",
  requireAuth,
  requireStaff,
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
      if (rows.length === 0 || rows[0].role !== "client") {
        res.status(404).json({ error: "client_not_found" });
        return;
      }
      const target = rows[0];

      if (actorRole === "manager" && target.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      // Accepts both inactive states. For admin deletion (deactivatedAt) we
      // also re-enable Firebase; for self-deletion (selfDeletedAt) Firebase
      // was never disabled, so the update is just a flag clear.
      if (!target.deactivatedAt && !target.selfDeletedAt) {
        res.status(409).json({ error: "not_deactivated" });
        return;
      }

      await db
        .update(users)
        .set({ deactivatedAt: null, selfDeletedAt: null })
        .where(eq(users.id, target.id));

      if (target.deactivatedAt) {
        try {
          await firebaseAuth.updateUser(target.firebaseUid, { disabled: false });
        } catch (fbErr) {
          console.error(
            "[clients] firebase enable failed for",
            target.firebaseUid,
            fbErr,
          );
        }
      }

      const [{ client, manager }] = await db
        .select({
          client: users,
          manager: {
            id: managers.id,
            firstName: managers.firstName,
            lastName: managers.lastName,
            email: managers.email,
            avatarUrl: managers.avatarUrl,
          },
        })
        .from(users)
        .leftJoin(managers, eq(managers.id, users.managerId))
        .where(eq(users.id, target.id))
        .limit(1);

      res.json({
        client: serialize(client, manager?.id ? (manager as ManagerSummary) : null),
      });
    } catch (err) {
      next(err);
    }
  },
);
