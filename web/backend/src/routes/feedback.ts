import { Router } from "express";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { feedback, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaff } from "../middleware/requireRole";

export const feedbackRouter = Router();

type StaffRole = "manager" | "senior_manager" | "admin";
type FeedbackStatus = "new" | "in_progress" | "resolved";

const VALID_STATUSES: ReadonlySet<FeedbackStatus> = new Set([
  "new",
  "in_progress",
  "resolved",
]);

// Mirror cancellations.ts: alias users for the joined client / manager rows.
const clientUsers = alias(users, "fb_client_users");
const managerUsers = alias(users, "fb_manager_users");
const readByUsers = alias(users, "fb_read_by_users");
const resolvedByUsers = alias(users, "fb_resolved_by_users");

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

function scopeFilter(actorId: string, actorRole: StaffRole): SQL | undefined {
  if (actorRole === "manager") {
    return eq(feedback.managerId, actorId);
  }
  return undefined;
}

function bodySnippet(s: string, n = 160): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

// POST /me/feedback — client-only. Snapshots manager_id at submission time.
feedbackRouter.post(
  "/me/feedback",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole;
      if (actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;

      const messageRaw = typeof body.message === "string" ? body.message : "";
      const message = messageRaw.trim();
      if (message.length === 0) {
        res.status(400).json({ error: "message_required" });
        return;
      }
      if (message.length > 5000) {
        res.status(400).json({ error: "message_too_long" });
        return;
      }

      // Optional client meta — keep snapshots short to avoid garbage.
      const platformRaw =
        typeof body.platform === "string" ? body.platform.toLowerCase() : null;
      const platform =
        platformRaw === "ios" || platformRaw === "android" ? platformRaw : null;
      const appVersionRaw =
        typeof body.appVersion === "string" ? body.appVersion : null;
      const appVersion =
        appVersionRaw && appVersionRaw.length > 0
          ? appVersionRaw.slice(0, 32)
          : null;

      const [client] = await db
        .select({ managerId: users.managerId })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);

      const [created] = await db
        .insert(feedback)
        .values({
          clientId: actorId,
          managerId: client?.managerId ?? null,
          body: message,
          clientPlatform: platform,
          clientAppVersion: appVersion,
        })
        .returning({ id: feedback.id });

      res.status(201).json({ feedback: { id: created.id } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /feedback?q=&page=&pageSize=&status=&clientId=
feedbackRouter.get(
  "/feedback",
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

      const statusRaw =
        typeof req.query.status === "string" && req.query.status
          ? String(req.query.status)
          : null;
      const statusFilter =
        statusRaw && VALID_STATUSES.has(statusRaw as FeedbackStatus)
          ? (statusRaw as FeedbackStatus)
          : null;

      const clientIdFilter =
        typeof req.query.clientId === "string" && req.query.clientId
          ? String(req.query.clientId)
          : null;

      const conditions: SQL[] = [];
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
      if (statusFilter) conditions.push(eq(feedback.status, statusFilter));
      if (clientIdFilter) conditions.push(eq(feedback.clientId, clientIdFilter));
      if (q) {
        const like = `%${q}%`;
        const built = or(
          ilike(clientUsers.firstName, like),
          ilike(clientUsers.lastName, like),
          ilike(clientUsers.email, like),
          ilike(feedback.body, like),
        );
        if (built) conditions.push(built);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const totalRows = await db
        .select({ total: count() })
        .from(feedback)
        .innerJoin(clientUsers, eq(clientUsers.id, feedback.clientId))
        .where(where);
      const total = Number(totalRows[0]?.total ?? 0);

      const rows = await db
        .select({
          feedback,
          client: {
            id: clientUsers.id,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
            email: clientUsers.email,
            avatarUrl: clientUsers.avatarUrl,
          },
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
            email: managerUsers.email,
            avatarUrl: managerUsers.avatarUrl,
          },
        })
        .from(feedback)
        .innerJoin(clientUsers, eq(clientUsers.id, feedback.clientId))
        .leftJoin(managerUsers, eq(managerUsers.id, feedback.managerId))
        .where(where)
        .orderBy(desc(feedback.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({
        feedback: rows.map((r) => ({
          id: r.feedback.id,
          status: r.feedback.status,
          bodySnippet: bodySnippet(r.feedback.body),
          createdAt: r.feedback.createdAt,
          client: r.client as UserSummary,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
        })),
        page,
        pageSize,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /feedback/:id — full detail used by the drawer.
feedbackRouter.get(
  "/feedback/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;

      const [r] = await db
        .select({
          feedback,
          client: {
            id: clientUsers.id,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
            email: clientUsers.email,
            phone: clientUsers.phone,
            avatarUrl: clientUsers.avatarUrl,
          },
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
            email: managerUsers.email,
            avatarUrl: managerUsers.avatarUrl,
          },
          readBy: {
            id: readByUsers.id,
            firstName: readByUsers.firstName,
            lastName: readByUsers.lastName,
            email: readByUsers.email,
            avatarUrl: readByUsers.avatarUrl,
          },
          resolvedBy: {
            id: resolvedByUsers.id,
            firstName: resolvedByUsers.firstName,
            lastName: resolvedByUsers.lastName,
            email: resolvedByUsers.email,
            avatarUrl: resolvedByUsers.avatarUrl,
          },
        })
        .from(feedback)
        .innerJoin(clientUsers, eq(clientUsers.id, feedback.clientId))
        .leftJoin(managerUsers, eq(managerUsers.id, feedback.managerId))
        .leftJoin(readByUsers, eq(readByUsers.id, feedback.readByUserId))
        .leftJoin(
          resolvedByUsers,
          eq(resolvedByUsers.id, feedback.resolvedByUserId),
        )
        .where(eq(feedback.id, req.params.id))
        .limit(1);

      if (!r) {
        res.status(404).json({ error: "feedback_not_found" });
        return;
      }
      if (actorRole === "manager" && r.feedback.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json({
        feedback: {
          id: r.feedback.id,
          status: r.feedback.status,
          body: r.feedback.body,
          adminNote: r.feedback.adminNote,
          clientPlatform: r.feedback.clientPlatform,
          clientAppVersion: r.feedback.clientAppVersion,
          createdAt: r.feedback.createdAt,
          updatedAt: r.feedback.updatedAt,
          readAt: r.feedback.readAt,
          resolvedAt: r.feedback.resolvedAt,
          client: r.client,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
          readBy:
            r.readBy?.id !== null && r.readBy?.id !== undefined
              ? (r.readBy as UserSummary)
              : null,
          resolvedBy:
            r.resolvedBy?.id !== null && r.resolvedBy?.id !== undefined
              ? (r.resolvedBy as UserSummary)
              : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /feedback/:id — staff status / note update. Body:
//   { status?: 'new'|'in_progress'|'resolved', adminNote?: string|null }
feedbackRouter.patch(
  "/feedback/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const id = req.params.id;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const statusRaw =
        typeof body.status === "string" ? (body.status as string) : null;
      const nextStatus =
        statusRaw && VALID_STATUSES.has(statusRaw as FeedbackStatus)
          ? (statusRaw as FeedbackStatus)
          : null;
      if (statusRaw !== null && nextStatus === null) {
        res.status(400).json({ error: "invalid_status" });
        return;
      }

      let nextNote: string | null | undefined = undefined;
      if (Object.prototype.hasOwnProperty.call(body, "adminNote")) {
        if (body.adminNote === null) {
          nextNote = null;
        } else if (typeof body.adminNote === "string") {
          const trimmed = body.adminNote.slice(0, 2000);
          nextNote = trimmed.length === 0 ? null : trimmed;
        } else {
          res.status(400).json({ error: "invalid_admin_note" });
          return;
        }
      }

      if (nextStatus === null && nextNote === undefined) {
        res.status(400).json({ error: "no_changes" });
        return;
      }

      const [existing] = await db
        .select({
          managerId: feedback.managerId,
          status: feedback.status,
          readAt: feedback.readAt,
        })
        .from(feedback)
        .where(eq(feedback.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "feedback_not_found" });
        return;
      }
      if (actorRole === "manager" && existing.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const now = new Date();
      const update: Partial<typeof feedback.$inferInsert> = {
        updatedAt: now,
      };
      if (nextStatus !== null) {
        update.status = nextStatus;
        if (nextStatus === "resolved" && existing.status !== "resolved") {
          update.resolvedAt = now;
          update.resolvedByUserId = actorId;
        }
        // Stepping back from resolved clears the resolution audit.
        if (nextStatus !== "resolved" && existing.status === "resolved") {
          update.resolvedAt = null;
          update.resolvedByUserId = null;
        }
      }
      if (nextNote !== undefined) {
        update.adminNote = nextNote;
      }
      // First-touch audit: any mutation by staff seals readAt.
      if (existing.readAt === null) {
        update.readAt = now;
        update.readByUserId = actorId;
      }

      await db.update(feedback).set(update).where(eq(feedback.id, id));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// GET /me/feedback/unread-count — staff sidebar badge. Counts rows in 'new'
// status under the actor's RBAC scope. Mirrors /chat/unread-count semantics.
feedbackRouter.get(
  "/me/feedback/unread-count",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;

      const conditions: SQL[] = [eq(feedback.status, "new")];
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
      const where = and(...conditions);

      const rows = await db
        .select({ total: count() })
        .from(feedback)
        .where(where);
      res.json({ count: Number(rows[0]?.total ?? 0) });
    } catch (err) {
      next(err);
    }
  },
);
