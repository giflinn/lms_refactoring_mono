import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  productCategories,
  productFavorites,
  products,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const favoritesRouter = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductRow = typeof products.$inferSelect;
type CategorySummary = { id: string; name: string };

// Identical shape to clientCatalog's serializer — kept duplicated rather than
// extracted into a shared helper while there's only two callers.
function serialize(p: ProductRow, category: CategorySummary | null) {
  return {
    id: p.id,
    categoryId: p.categoryId,
    category,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    buttonText: p.buttonText,
    price: p.price,
    daysUntilCancel: p.daysUntilCancel,
    isPromo: p.isPromo,
    isTopSearch: p.isTopSearch,
    coverKind: p.coverKind,
    coverImageUrl: p.coverImageUrl,
  };
}

// requireAuth gives us the Firebase UID. All FK targets in our schema use the
// internal users.id UUID, so each route looks up the local id once.
async function resolveUserId(firebaseUid: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);
  return rows[0]?.id ?? null;
}

// GET /favorites — products the authenticated user has favorited, joined with
// their category for client-side grouping. Inactive products are filtered so
// removed/hidden items vanish from the favorites list without an explicit
// cleanup step.
favoritesRouter.get("/favorites", requireAuth, async (req, res, next) => {
  try {
    const userId = await resolveUserId(req.uid!);
    if (!userId) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const rows = await db
      .select({
        product: products,
        category: { id: productCategories.id, name: productCategories.name },
      })
      .from(productFavorites)
      .innerJoin(products, eq(products.id, productFavorites.productId))
      .leftJoin(
        productCategories,
        eq(productCategories.id, products.categoryId),
      )
      .where(
        and(
          eq(productFavorites.userId, userId),
          eq(products.isActive, true),
        ),
      )
      .orderBy(desc(productFavorites.createdAt));

    res.json({
      products: rows.map((r) =>
        serialize(r.product, r.category?.id ? r.category : null),
      ),
    });
  } catch (err) {
    next(err);
  }
});

// GET /favorites/ids — lightweight set of product IDs the user has favorited.
// The mobile catalog uses this to know which hearts to fill on the home and
// detail screens without re-fetching every favorite's full payload.
favoritesRouter.get("/favorites/ids", requireAuth, async (req, res, next) => {
  try {
    const userId = await resolveUserId(req.uid!);
    if (!userId) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    const rows = await db
      .select({ productId: productFavorites.productId })
      .from(productFavorites)
      .where(eq(productFavorites.userId, userId));
    res.json({ ids: rows.map((r) => r.productId) });
  } catch (err) {
    next(err);
  }
});

// POST /favorites/:productId — idempotent add. The composite PK + ON CONFLICT
// DO NOTHING means a second tap doesn't error or duplicate the row.
favoritesRouter.post(
  "/favorites/:productId",
  requireAuth,
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      if (!UUID_REGEX.test(productId)) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      const userId = await resolveUserId(req.uid!);
      if (!userId) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }

      const exists = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.isActive, true)))
        .limit(1);
      if (exists.length === 0) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      await db
        .insert(productFavorites)
        .values({ userId, productId })
        .onConflictDoNothing();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /favorites/:productId — idempotent remove.
favoritesRouter.delete(
  "/favorites/:productId",
  requireAuth,
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      if (!UUID_REGEX.test(productId)) {
        res.json({ ok: true });
        return;
      }
      const userId = await resolveUserId(req.uid!);
      if (!userId) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }
      await db
        .delete(productFavorites)
        .where(
          and(
            eq(productFavorites.userId, userId),
            eq(productFavorites.productId, productId),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
