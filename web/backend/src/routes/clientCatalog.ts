import { Router } from "express";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { productCategories, products } from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const clientCatalogRouter = Router();

const SEARCH_LIMIT = 50;
const TOP_SEARCH_LIMIT = 10;

type ProductRow = typeof products.$inferSelect;
type CategorySummary = { id: string; name: string };

// Catalog payload shape mirrors the admin /products serializer minus the
// price-tag we don't yet show on mobile, but kept identical so a future
// mobile-side checkout can reuse the same model.
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

// GET /catalog — full snapshot for the home screen: every active category
// (even empty ones, so the tab strip is complete) plus every active product
// across all categories. Mobile filters/group on the client; the dataset is
// small enough (~tens to low hundreds) that paginating per-category would
// only add round-trips.
clientCatalogRouter.get("/catalog", requireAuth, async (_req, res, next) => {
  try {
    const categoryRows = await db
      .select({ id: productCategories.id, name: productCategories.name })
      .from(productCategories)
      .orderBy(asc(productCategories.name));

    const productRows = await db
      .select({
        product: products,
        category: { id: productCategories.id, name: productCategories.name },
      })
      .from(products)
      .leftJoin(
        productCategories,
        eq(productCategories.id, products.categoryId),
      )
      .where(eq(products.isActive, true))
      .orderBy(desc(products.createdAt));

    res.json({
      categories: categoryRows,
      products: productRows.map((r) =>
        serialize(r.product, r.category?.id ? r.category : null),
      ),
    });
  } catch (err) {
    next(err);
  }
});

// GET /catalog/search?q=<query> — case-insensitive ilike on title + subtitle.
// description is excluded on purpose (it's long-form marketing copy that
// produces noisy matches). Always active-only.
clientCatalogRouter.get(
  "/catalog/search",
  requireAuth,
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) {
        res.json({ products: [] });
        return;
      }
      const pattern = `%${q}%`;
      const conditions: SQL[] = [
        eq(products.isActive, true),
        // `or(...)` requires at least two args at the type level, but drizzle
        // accepts SQL[] at runtime — narrow with `!` after we've populated.
        or(ilike(products.title, pattern), ilike(products.subtitle, pattern))!,
      ];

      const rows = await db
        .select({
          product: products,
          category: { id: productCategories.id, name: productCategories.name },
        })
        .from(products)
        .leftJoin(
          productCategories,
          eq(productCategories.id, products.categoryId),
        )
        .where(and(...conditions))
        .orderBy(desc(products.createdAt))
        .limit(SEARCH_LIMIT);

      res.json({
        products: rows.map((r) =>
          serialize(r.product, r.category?.id ? r.category : null),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /catalog/top-search — products flagged isTopSearch=true (plus active).
// Used as the "Популярное" fallback when search returns no results.
clientCatalogRouter.get(
  "/catalog/top-search",
  requireAuth,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          product: products,
          category: { id: productCategories.id, name: productCategories.name },
        })
        .from(products)
        .leftJoin(
          productCategories,
          eq(productCategories.id, products.categoryId),
        )
        .where(and(eq(products.isActive, true), eq(products.isTopSearch, true)))
        .orderBy(desc(products.createdAt))
        .limit(TOP_SEARCH_LIMIT);

      res.json({
        products: rows.map((r) =>
          serialize(r.product, r.category?.id ? r.category : null),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);
