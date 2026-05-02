import { Router } from "express";
import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "../db";
import { coachSlots, slotTypes } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";

export const coachSlotsRouter = Router();

type CoachSlotRow = typeof coachSlots.$inferSelect;
type SlotTypeRow = typeof slotTypes.$inferSelect;

function serialize(
  s: CoachSlotRow,
  t: Pick<SlotTypeRow, "id" | "name" | "color">,
) {
  return {
    id: s.id,
    slotTypeId: s.slotTypeId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
    createdByUserId: s.createdByUserId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    slotType: { id: t.id, name: t.name, color: t.color },
  };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Two ranges [s1,e1) and [s2,e2) overlap iff s1 < e2 AND s2 < e1.
// Only `active` slots compete for the timeline; cancelled ones are ignored.
async function hasOverlap(
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<boolean> {
  const conds = [
    eq(coachSlots.status, "active"),
    lt(coachSlots.startsAt, endsAt),
    gt(coachSlots.endsAt, startsAt),
  ];
  if (excludeId) conds.push(ne(coachSlots.id, excludeId));
  const rows = await db
    .select({ id: coachSlots.id })
    .from(coachSlots)
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}

// GET /coach-slots?from=ISO&to=ISO[&slotTypeId=uuid] — all active slots whose
// time range overlaps [from, to). The frontend calls this per visible week.
coachSlotsRouter.get(
  "/coach-slots",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      if (!from || !to || to <= from) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }

      const slotTypeFilter =
        typeof req.query.slotTypeId === "string" && req.query.slotTypeId
          ? req.query.slotTypeId
          : null;

      const conds = [
        eq(coachSlots.status, "active"),
        lt(coachSlots.startsAt, to),
        gt(coachSlots.endsAt, from),
      ];
      if (slotTypeFilter)
        conds.push(eq(coachSlots.slotTypeId, slotTypeFilter));

      const rows = await db
        .select({
          slot: coachSlots,
          type: {
            id: slotTypes.id,
            name: slotTypes.name,
            color: slotTypes.color,
          },
        })
        .from(coachSlots)
        .innerJoin(slotTypes, eq(coachSlots.slotTypeId, slotTypes.id))
        .where(and(...conds))
        .orderBy(asc(coachSlots.startsAt));

      res.json({ slots: rows.map((r) => serialize(r.slot, r.type)) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /coach-slots — create a new active slot. Future-only, type must be
// non-archived, and no overlap with another active slot.
coachSlotsRouter.post(
  "/coach-slots",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const slotTypeId = String(body.slotTypeId ?? "").trim();
      const startsAt = parseDate(body.startsAt);
      const endsAt = parseDate(body.endsAt);

      if (!slotTypeId) {
        res.status(400).json({ error: "slot_type_id_required" });
        return;
      }
      if (!startsAt || !endsAt) {
        res.status(400).json({ error: "invalid_date" });
        return;
      }
      if (endsAt <= startsAt) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      if (startsAt.getTime() < Date.now()) {
        res.status(400).json({ error: "starts_in_past" });
        return;
      }

      const typeRows = await db
        .select()
        .from(slotTypes)
        .where(eq(slotTypes.id, slotTypeId))
        .limit(1);
      if (typeRows.length === 0) {
        res.status(404).json({ error: "slot_type_not_found" });
        return;
      }
      if (typeRows[0].archivedAt) {
        res.status(400).json({ error: "slot_type_archived" });
        return;
      }

      if (await hasOverlap(startsAt, endsAt)) {
        res.status(409).json({ error: "slot_overlap" });
        return;
      }

      const [row] = await db
        .insert(coachSlots)
        .values({
          slotTypeId,
          startsAt,
          endsAt,
          createdByUserId: req.actorId!,
        })
        .returning();

      res.json({ slot: serialize(row, typeRows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /coach-slots/:id — edit type and/or time on an active slot. If the
// type is changing, the new type must be non-archived; if only the time is
// changing on an already-archived type the edit is still allowed (the slot
// was created when the type was active).
coachSlotsRouter.patch(
  "/coach-slots/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;

      const existingRows = await db
        .select()
        .from(coachSlots)
        .where(eq(coachSlots.id, id))
        .limit(1);
      if (existingRows.length === 0) {
        res.status(404).json({ error: "slot_not_found" });
        return;
      }
      const current = existingRows[0];
      if (current.status === "cancelled") {
        res.status(409).json({ error: "slot_cancelled" });
        return;
      }

      let nextStartsAt = current.startsAt;
      let nextEndsAt = current.endsAt;
      let nextSlotTypeId = current.slotTypeId;

      if (body.startsAt !== undefined) {
        const d = parseDate(body.startsAt);
        if (!d) {
          res.status(400).json({ error: "invalid_date" });
          return;
        }
        nextStartsAt = d;
      }
      if (body.endsAt !== undefined) {
        const d = parseDate(body.endsAt);
        if (!d) {
          res.status(400).json({ error: "invalid_date" });
          return;
        }
        nextEndsAt = d;
      }
      if (body.slotTypeId !== undefined) {
        const v = String(body.slotTypeId).trim();
        if (!v) {
          res.status(400).json({ error: "slot_type_id_required" });
          return;
        }
        nextSlotTypeId = v;
      }

      if (nextEndsAt <= nextStartsAt) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const timeChanged =
        nextStartsAt.getTime() !== current.startsAt.getTime() ||
        nextEndsAt.getTime() !== current.endsAt.getTime();
      if (timeChanged && nextStartsAt.getTime() < Date.now()) {
        res.status(400).json({ error: "starts_in_past" });
        return;
      }

      const typeRows = await db
        .select()
        .from(slotTypes)
        .where(eq(slotTypes.id, nextSlotTypeId))
        .limit(1);
      if (typeRows.length === 0) {
        res.status(404).json({ error: "slot_type_not_found" });
        return;
      }
      if (
        typeRows[0].archivedAt &&
        nextSlotTypeId !== current.slotTypeId
      ) {
        res.status(400).json({ error: "slot_type_archived" });
        return;
      }

      if (timeChanged && (await hasOverlap(nextStartsAt, nextEndsAt, id))) {
        res.status(409).json({ error: "slot_overlap" });
        return;
      }

      const [row] = await db
        .update(coachSlots)
        .set({
          slotTypeId: nextSlotTypeId,
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(coachSlots.id, id))
        .returning();

      res.json({ slot: serialize(row, typeRows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /coach-slots/:id — soft cancel. Idempotent: cancelling a cancelled
// slot returns ok. When bookings exist (later phase) we'll add a check to
// refuse cancellation until bookings are handled.
coachSlotsRouter.delete(
  "/coach-slots/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;

      const existing = await db
        .select({ status: coachSlots.status })
        .from(coachSlots)
        .where(eq(coachSlots.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "slot_not_found" });
        return;
      }
      if (existing[0].status === "cancelled") {
        res.json({ ok: true });
        return;
      }

      await db
        .update(coachSlots)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(coachSlots.id, id));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
