import { Router } from "express";
import { and, asc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  coachSlots,
  orderItems,
  slotTypes,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";

export const coachSlotsRouter = Router();

type CoachSlotRow = typeof coachSlots.$inferSelect;
type SlotTypeRow = typeof slotTypes.$inferSelect;

type BookingSummary = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  orderItemId: string | null;
  // The order this booking belongs to. Null when the booking was created
  // outside an order (no rows like that today, but the schema allows it).
  orderId: string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
};

function serialize(
  s: CoachSlotRow,
  t: Pick<SlotTypeRow, "id" | "name" | "color">,
  bookings: BookingSummary[] = [],
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
    bookings,
  };
}

// Fetches active bookings for the given slot ids and groups them by slot.
async function fetchBookingsForSlots(
  slotIds: string[],
): Promise<Map<string, BookingSummary[]>> {
  const map = new Map<string, BookingSummary[]>();
  if (slotIds.length === 0) return map;
  const rows = await db
    .select({
      booking: coachBookings,
      orderId: orderItems.orderId,
      client: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(coachBookings)
    .innerJoin(users, eq(users.id, coachBookings.clientId))
    .leftJoin(orderItems, eq(orderItems.id, coachBookings.orderItemId))
    .where(
      and(
        inArray(coachBookings.coachSlotId, slotIds),
        eq(coachBookings.status, "active"),
      ),
    )
    .orderBy(asc(coachBookings.startsAt));
  for (const r of rows) {
    const arr = map.get(r.booking.coachSlotId) ?? [];
    arr.push({
      id: r.booking.id,
      startsAt: r.booking.startsAt,
      endsAt: r.booking.endsAt,
      orderItemId: r.booking.orderItemId,
      orderId: r.orderId ?? null,
      client: r.client,
    });
    map.set(r.booking.coachSlotId, arr);
  }
  return map;
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

      const bookingsBySlot = await fetchBookingsForSlots(
        rows.map((r) => r.slot.id),
      );

      res.json({
        slots: rows.map((r) =>
          serialize(r.slot, r.type, bookingsBySlot.get(r.slot.id) ?? []),
        ),
      });
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

      // If the slot's time is changing, refuse if any active booking falls
      // outside the new range. Editing the type while bookings exist is fine
      // (booking type is decoupled — it inherits via the slot reference).
      if (timeChanged) {
        const stillFits = await db
          .select({ id: coachBookings.id })
          .from(coachBookings)
          .where(
            and(
              eq(coachBookings.coachSlotId, id),
              eq(coachBookings.status, "active"),
              or(
                lt(coachBookings.startsAt, nextStartsAt),
                gt(coachBookings.endsAt, nextEndsAt),
              )!,
            ),
          )
          .limit(1);
        if (stillFits.length > 0) {
          res.status(409).json({ error: "slot_has_bookings" });
          return;
        }
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

      const bookingsBySlot = await fetchBookingsForSlots([row.id]);
      res.json({
        slot: serialize(row, typeRows[0], bookingsBySlot.get(row.id) ?? []),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /coach-slots/:id — soft cancel. Idempotent on already-cancelled
// slots. Refuses if active bookings exist — staff must move/cancel the
// related orders first.
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

      const activeBookings = await db
        .select({ id: coachBookings.id })
        .from(coachBookings)
        .where(
          and(
            eq(coachBookings.coachSlotId, id),
            eq(coachBookings.status, "active"),
          ),
        )
        .limit(1);
      if (activeBookings.length > 0) {
        res.status(409).json({ error: "slot_has_bookings" });
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
