import { Router } from "express";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  notifications,
  notificationDeliveries,
  type clientCategoryEnum,
  type notificationRecurrenceUnitEnum,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaffAdmin } from "../middleware/requireRole";
import {
  computeNextFireAt,
  VALID_WEEKDAYS,
  type RecurrenceUnit,
} from "../services/notificationRecurrence";

export const notificationsRouter = Router();

type ClientCategory = (typeof clientCategoryEnum.enumValues)[number];
type RecurrenceUnitValue =
  (typeof notificationRecurrenceUnitEnum.enumValues)[number];

const VALID_CATEGORIES: ClientCategory[] = ["new", "regular", "vip"];
const VALID_UNITS: RecurrenceUnitValue[] = ["week", "month", "year"];

const TITLE_MAX = 200;
const BODY_MAX = 2000;
const INTERVAL_MAX = 52;

function serialize(n: typeof notifications.$inferSelect) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    category: n.category,
    scheduledAt: n.scheduledAt,
    recurrenceUnit: n.recurrenceUnit,
    recurrenceInterval: n.recurrenceInterval,
    recurrenceByweekday: n.recurrenceByweekday,
    startsAt: n.startsAt,
    endsAt: n.endsAt,
    nextFireAt: n.nextFireAt,
    status: n.status,
    isRecurring: n.recurrenceUnit !== null,
    createdAt: n.createdAt,
  };
}

type Parsed = {
  title: string;
  body: string;
  category: ClientCategory | null;
  scheduledAt: Date | null;
  recurrenceUnit: RecurrenceUnitValue | null;
  recurrenceInterval: number | null;
  recurrenceByweekday: string[] | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

// Parses + validates a create/update payload. Returns either a normalised
// row, or an error code matching the {error: "..."} shape used elsewhere.
function parsePayload(
  body: Record<string, unknown>,
): { data: Parsed } | { error: string } {
  const title = String(body.title ?? "").trim();
  if (!title) return { error: "title_required" };
  if (title.length > TITLE_MAX) return { error: "title_too_long" };

  const text = String(body.body ?? "").trim();
  if (!text) return { error: "body_required" };
  if (text.length > BODY_MAX) return { error: "body_too_long" };

  let category: ClientCategory | null = null;
  if (body.category != null && body.category !== "") {
    const raw = String(body.category);
    if (!VALID_CATEGORIES.includes(raw as ClientCategory)) {
      return { error: "invalid_category" };
    }
    category = raw as ClientCategory;
  }

  const sendNow = body.sendNow === true || body.sendNow === "true";
  const recurring = body.recurring === true || body.recurring === "true";

  if (sendNow && recurring) {
    return { error: "send_now_with_recurring" };
  }

  let scheduledAt: Date | null = null;
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let recurrenceUnit: RecurrenceUnitValue | null = null;
  let recurrenceInterval: number | null = null;
  let recurrenceByweekday: string[] | null = null;

  if (recurring) {
    const start = parseDate(body.startsAt);
    if (!start) return { error: "starts_at_required" };
    startsAt = start;

    if (body.endsAt != null && body.endsAt !== "") {
      const end = parseDate(body.endsAt);
      if (!end) return { error: "invalid_ends_at" };
      if (end < start) return { error: "ends_at_before_starts_at" };
      endsAt = end;
    }

    const unit = String(body.recurrenceUnit ?? "");
    if (!VALID_UNITS.includes(unit as RecurrenceUnitValue)) {
      return { error: "invalid_recurrence_unit" };
    }
    recurrenceUnit = unit as RecurrenceUnitValue;

    const interval = Number(body.recurrenceInterval);
    if (!Number.isInteger(interval) || interval < 1 || interval > INTERVAL_MAX) {
      return { error: "invalid_recurrence_interval" };
    }
    recurrenceInterval = interval;

    if (body.recurrenceByweekday != null) {
      if (!Array.isArray(body.recurrenceByweekday)) {
        return { error: "invalid_recurrence_byweekday" };
      }
      const days = body.recurrenceByweekday.map((d) => String(d).toLowerCase());
      if (days.some((d) => !VALID_WEEKDAYS.includes(d))) {
        return { error: "invalid_recurrence_byweekday" };
      }
      // byweekday only meaningful for weekly recurrence — drop it otherwise.
      if (recurrenceUnit === "week" && days.length > 0) {
        recurrenceByweekday = Array.from(new Set(days));
      }
    }
  } else if (sendNow) {
    scheduledAt = new Date();
  } else {
    const at = parseDate(body.scheduledAt);
    if (!at) return { error: "scheduled_at_required" };
    scheduledAt = at;
  }

  return {
    data: {
      title,
      body: text,
      category,
      scheduledAt,
      recurrenceUnit,
      recurrenceInterval,
      recurrenceByweekday,
      startsAt,
      endsAt,
    },
  };
}

function parseDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

// Takes a parsed row and computes the dispatcher cursor (next_fire_at). For
// one-shots that's just scheduledAt. For recurring, walk the schedule from
// startsAt with inclusive=true so a future startsAt can itself be the first
// fire.
function computeCursor(p: Parsed): Date | null {
  if (p.recurrenceUnit) {
    return computeNextFireAt(
      {
        startsAt: p.startsAt!,
        unit: p.recurrenceUnit as RecurrenceUnit,
        interval: p.recurrenceInterval!,
        byweekday: p.recurrenceByweekday,
        endsAt: p.endsAt,
      },
      new Date(),
      true,
    );
  }
  return p.scheduledAt;
}

// GET /notifications?status=active|completed&category=
notificationsRouter.get(
  "/notifications",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const statusRaw = String(req.query.status ?? "active").toLowerCase();
      const conditions: SQL[] = [];
      if (statusRaw === "completed") {
        conditions.push(eq(notifications.status, "completed"));
      } else {
        conditions.push(eq(notifications.status, "active"));
      }

      if (req.query.category) {
        const c = String(req.query.category).toLowerCase();
        if (c === "all") {
          conditions.push(isNull(notifications.category));
        } else if (VALID_CATEGORIES.includes(c as ClientCategory)) {
          conditions.push(
            eq(notifications.category, c as ClientCategory),
          );
        }
      }

      const rows = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt));

      res.json({ notifications: rows.map(serialize) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /notifications
notificationsRouter.post(
  "/notifications",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const parsed = parsePayload((req.body ?? {}) as Record<string, unknown>);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const p = parsed.data;
      const nextFireAt = computeCursor(p);
      if (!nextFireAt) {
        res.status(400).json({ error: "no_future_fires" });
        return;
      }

      const [row] = await db
        .insert(notifications)
        .values({
          title: p.title,
          body: p.body,
          category: p.category,
          scheduledAt: p.scheduledAt,
          recurrenceUnit: p.recurrenceUnit,
          recurrenceInterval: p.recurrenceInterval,
          recurrenceByweekday: p.recurrenceByweekday,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          nextFireAt,
          createdByUserId: req.actorId as string,
        })
        .returning();

      res.json({ notification: serialize(row) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /notifications/:id — full re-validation of the new payload, then
// recompute next_fire_at from scratch. We allow editing 'completed' rows
// (admin can revive a stale recurring schedule); the payload determines the
// new status implicitly via computeCursor.
notificationsRouter.patch(
  "/notifications/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const existing = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "notification_not_found" });
        return;
      }

      const parsed = parsePayload((req.body ?? {}) as Record<string, unknown>);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const p = parsed.data;
      const nextFireAt = computeCursor(p);
      if (!nextFireAt) {
        res.status(400).json({ error: "no_future_fires" });
        return;
      }

      const [row] = await db
        .update(notifications)
        .set({
          title: p.title,
          body: p.body,
          category: p.category,
          scheduledAt: p.scheduledAt,
          recurrenceUnit: p.recurrenceUnit,
          recurrenceInterval: p.recurrenceInterval,
          recurrenceByweekday: p.recurrenceByweekday,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          nextFireAt,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(notifications.id, id))
        .returning();

      res.json({ notification: serialize(row) });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /notifications/:id — hard delete. Cascade removes deliveries.
notificationsRouter.delete(
  "/notifications/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const result = await db
        .delete(notifications)
        .where(eq(notifications.id, id))
        .returning({ id: notifications.id });
      if (result.length === 0) {
        res.status(404).json({ error: "notification_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────── Client-facing inbox (mobile cabinet → notifications) ──────

const INBOX_LIMIT = 100;

// GET /me/notifications — last 100 deliveries for the authed user joined
// against the parent notification for title/body. Sorted newest first.
notificationsRouter.get(
  "/me/notifications",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const userId = req.actorId as string;
      const rows = await db
        .select({
          id: notificationDeliveries.id,
          title: notifications.title,
          body: notifications.body,
          sentAt: notificationDeliveries.sentAt,
          readAt: notificationDeliveries.readAt,
        })
        .from(notificationDeliveries)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationDeliveries.notificationId),
        )
        .where(eq(notificationDeliveries.userId, userId))
        .orderBy(desc(notificationDeliveries.sentAt))
        .limit(INBOX_LIMIT);

      res.json({ notifications: rows });
    } catch (err) {
      next(err);
    }
  },
);

// GET /me/notifications/unread-count — used by the cabinet badge.
notificationsRouter.get(
  "/me/notifications/unread-count",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const userId = req.actorId as string;
      const rows = await db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.userId, userId),
            isNull(notificationDeliveries.readAt),
          ),
        );
      res.json({ count: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// POST /me/notifications/mark-read — flips read_at on every still-unread row
// for this user. The mobile inbox calls this on page-open (Figma has no per-
// row read action), so a "mark all" is the only mode we need.
notificationsRouter.post(
  "/me/notifications/mark-read",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const userId = req.actorId as string;
      await db
        .update(notificationDeliveries)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notificationDeliveries.userId, userId),
            isNull(notificationDeliveries.readAt),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
