import { Router } from "express";
import { asc, count, eq } from "drizzle-orm";
import { db } from "../db";
import { productCategories, products } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";

export const productCategoriesRouter = Router();

const NAME_MAX = 60;

type CategoryRow = typeof productCategories.$inferSelect;

function serialize(c: CategoryRow, productCount: number) {
  return {
    id: c.id,
    name: c.name,
    productCount,
    createdAt: c.createdAt,
  };
}

// GET /product-categories — list with product counts. Sorted by name so the
// drawer reads in a stable order regardless of insertion time.
productCategoriesRouter.get(
  "/product-categories",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          category: productCategories,
          productCount: count(products.id),
        })
        .from(productCategories)
        .leftJoin(products, eq(products.categoryId, productCategories.id))
        .groupBy(productCategories.id)
        .orderBy(asc(productCategories.name));

      res.json({
        categories: rows.map((r) => serialize(r.category, Number(r.productCount))),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /product-categories — create. Name must be unique (DB-enforced).
productCategoriesRouter.post(
  "/product-categories",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "name_required" });
        return;
      }
      if (name.length > NAME_MAX) {
        res.status(400).json({ error: "name_too_long" });
        return;
      }

      try {
        const [row] = await db
          .insert(productCategories)
          .values({ name })
          .returning();
        res.json({ category: serialize(row, 0) });
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

// PATCH /product-categories/:id — rename.
productCategoriesRouter.patch(
  "/product-categories/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "name_required" });
        return;
      }
      if (name.length > NAME_MAX) {
        res.status(400).json({ error: "name_too_long" });
        return;
      }

      const existing = await db
        .select()
        .from(productCategories)
        .where(eq(productCategories.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "category_not_found" });
        return;
      }

      try {
        await db
          .update(productCategories)
          .set({ name })
          .where(eq(productCategories.id, id));
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          res.status(409).json({ error: "name_already_exists" });
          return;
        }
        throw err;
      }

      const [{ productCount }] = await db
        .select({ productCount: count() })
        .from(products)
        .where(eq(products.categoryId, id));

      res.json({
        category: serialize({ ...existing[0], name }, Number(productCount)),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /product-categories/:id — refuses if any product still belongs to
// the category. Admin must reassign or delete those products first.
productCategoriesRouter.delete(
  "/product-categories/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;

      const existing = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(eq(productCategories.id, id))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: "category_not_found" });
        return;
      }

      const [{ productCount }] = await db
        .select({ productCount: count() })
        .from(products)
        .where(eq(products.categoryId, id));
      if (Number(productCount) > 0) {
        res.status(409).json({ error: "category_has_products" });
        return;
      }

      await db.delete(productCategories).where(eq(productCategories.id, id));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
