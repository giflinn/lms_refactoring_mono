import { Router } from "express";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "../db";
import { slotTypes } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";

export const slotTypesRouter = Router();

const NAME_MAX = 60;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

type SlotTypeRow = typeof slotTypes.$inferSelect;

function serialize(row: SlotTypeRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /slot-types — list active types ordered by sort_order then name.
// Pass ?includeArchived=true to also see soft-deleted rows (admin restore UI).
slotTypesRouter.get(
  "/slot-types",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const includeArchived = req.query.includeArchived === "true";
      const rows = includeArchived
        ? await db
            .select()
            .from(slotTypes)
            .orderBy(asc(slotTypes.sortOrder), asc(slotTypes.name))
        : await db
            .select()
            .from(slotTypes)
            .where(isNull(slotTypes.archivedAt))
            .orderBy(asc(slotTypes.sortOrder), asc(slotTypes.name));

      res.json({ slotTypes: rows.map(serialize) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /slot-types — create. Auto-assigns sortOrder = max+1 across active rows
// so newly created types appear at the end of the list by default.
slotTypesRouter.post(
  "/slot-types",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      const color = String(body.color ?? "").trim();

      if (!name) {
        res.status(400).json({ error: "name_required" });
        return;
      }
      if (name.length > NAME_MAX) {
        res.status(400).json({ error: "name_too_long" });
        return;
      }
      if (!HEX_COLOR.test(color)) {
        res.status(400).json({ error: "invalid_color" });
        return;
      }

      const [{ value: maxOrder }] = await db
        .select({ value: max(slotTypes.sortOrder) })
        .from(slotTypes)
        .where(isNull(slotTypes.archivedAt));
      const sortOrder = (maxOrder ?? -1) + 1;

      try {
        const [row] = await db
          .insert(slotTypes)
          .values({ name, color, sortOrder })
          .returning();
        res.json({ slotType: serialize(row) });
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          res.status(409).json({ error: "name_already_exists" });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /slot-types/:id — update name, color, and/or sort order. Refuses to
// touch archived rows; restore is a separate concern handled later.
slotTypesRouter.patch(
  "/slot-types/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;

      const updates: Partial<typeof slotTypes.$inferInsert> = {};

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          res.status(400).json({ error: "name_required" });
          return;
        }
        if (name.length > NAME_MAX) {
          res.status(400).json({ error: "name_too_long" });
          return;
        }
        updates.name = name;
      }

      if (body.color !== undefined) {
        const color = String(body.color).trim();
        if (!HEX_COLOR.test(color)) {
          res.status(400).json({ error: "invalid_color" });
          return;
        }
        updates.color = color;
      }

      if (body.sortOrder !== undefined) {
        const sortOrder = Number(body.sortOrder);
        if (!Number.isInteger(sortOrder) || sortOrder < 0) {
          res.status(400).json({ error: "invalid_sort_order" });
          return;
        }
        updates.sortOrder = sortOrder;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "no_fields_to_update" });
        return;
      }

      const existing = await db
        .select()
        .from(slotTypes)
        .where(eq(slotTypes.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "slot_type_not_found" });
        return;
      }
      if (existing[0].archivedAt) {
        res.status(409).json({ error: "slot_type_archived" });
        return;
      }

      updates.updatedAt = new Date();

      try {
        const [row] = await db
          .update(slotTypes)
          .set(updates)
          .where(eq(slotTypes.id, id))
          .returning();
        res.json({ slotType: serialize(row) });
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          res.status(409).json({ error: "name_already_exists" });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /slot-types/:id — soft delete. Once coach_slots / bookings exist
// (later phase), they keep referencing the row; the partial unique index on
// name lets staff create a fresh type with the same name afterwards.
slotTypesRouter.delete(
  "/slot-types/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;

      const existing = await db
        .select({ id: slotTypes.id, archivedAt: slotTypes.archivedAt })
        .from(slotTypes)
        .where(eq(slotTypes.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "slot_type_not_found" });
        return;
      }
      if (existing[0].archivedAt) {
        res.json({ ok: true });
        return;
      }

      const now = new Date();
      await db
        .update(slotTypes)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(slotTypes.id, id), isNull(slotTypes.archivedAt)));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
