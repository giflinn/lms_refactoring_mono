import { Router } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import {
  coachSlots,
  productCategories,
  products,
  productSlotTypes,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const clientCatalogRouter = Router();

const SEARCH_LIMIT = 50;
const TOP_SEARCH_LIMIT = 10;

type ProductRow = typeof products.$inferSelect;
type CategorySummary = { id: string; name: string };

// Catalog payload shape mirrors the admin /products serializer minus the
// price-tag we don't yet show on mobile, but kept identical so a future
// mobile-side checkout can reuse the same model.
function serialize(
  p: ProductRow,
  category: CategorySummary | null,
  slotTypeIds: string[],
) {
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
    durationMinutes: p.durationMinutes,
    slotTypeIds,
    isPromo: p.isPromo,
    isTopSearch: p.isTopSearch,
    coverKind: p.coverKind,
    coverImageUrl: p.coverImageUrl,
  };
}

// Batch lookup for the m2m bindings — same pattern as admin /products. Empty
// productIds short-circuits to keep the round-trip count predictable.
async function loadSlotTypeIdsByProduct(
  productIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (productIds.length === 0) return out;
  const rows = await db
    .select({
      productId: productSlotTypes.productId,
      slotTypeId: productSlotTypes.slotTypeId,
    })
    .from(productSlotTypes)
    .where(inArray(productSlotTypes.productId, productIds));
  for (const r of rows) {
    const list = out.get(r.productId);
    if (list) list.push(r.slotTypeId);
    else out.set(r.productId, [r.slotTypeId]);
  }
  return out;
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

    const idsByProduct = await loadSlotTypeIdsByProduct(
      productRows.map((r) => r.product.id),
    );

    res.json({
      categories: categoryRows,
      products: productRows.map((r) =>
        serialize(
          r.product,
          r.category?.id ? r.category : null,
          idsByProduct.get(r.product.id) ?? [],
        ),
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

      const idsByProduct = await loadSlotTypeIdsByProduct(
        rows.map((r) => r.product.id),
      );

      res.json({
        products: rows.map((r) =>
          serialize(
            r.product,
            r.category?.id ? r.category : null,
            idsByProduct.get(r.product.id) ?? [],
          ),
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

      const idsByProduct = await loadSlotTypeIdsByProduct(
        rows.map((r) => r.product.id),
      );

      res.json({
        products: rows.map((r) =>
          serialize(
            r.product,
            r.category?.id ? r.category : null,
            idsByProduct.get(r.product.id) ?? [],
          ),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /catalog/products/:id/slots?from=ISO&to=ISO — returns the per-start
// availability windows the mobile detail page renders below the description.
// Slicing rule: each active coach slot whose type is bound to the product is
// chopped into back-to-back chunks of `product.duration_minutes`. Slots
// shorter than the product's duration produce zero starts and are skipped.
//
// Returns 400 if the product is not bookable (no duration or no bound types)
// — the client checks `durationMinutes` before calling, this is just a
// safety net.
clientCatalogRouter.get(
  "/catalog/products/:id/slots",
  requireAuth,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const fromRaw = req.query.from;
      const toRaw = req.query.to;
      if (typeof fromRaw !== "string" || typeof toRaw !== "string") {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const from = new Date(fromRaw);
      const to = new Date(toRaw);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }

      const productRows = await db
        .select({
          id: products.id,
          isActive: products.isActive,
          durationMinutes: products.durationMinutes,
        })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      if (productRows.length === 0 || !productRows[0].isActive) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      const product = productRows[0];
      if (product.durationMinutes == null) {
        res.status(400).json({ error: "product_not_bookable" });
        return;
      }

      const typeRows = await db
        .select({ slotTypeId: productSlotTypes.slotTypeId })
        .from(productSlotTypes)
        .where(eq(productSlotTypes.productId, id));
      if (typeRows.length === 0) {
        res.status(400).json({ error: "product_not_bookable" });
        return;
      }
      const typeIds = typeRows.map((r) => r.slotTypeId);

      const slotRows = await db
        .select({
          startsAt: coachSlots.startsAt,
          endsAt: coachSlots.endsAt,
        })
        .from(coachSlots)
        .where(
          and(
            eq(coachSlots.status, "active"),
            inArray(coachSlots.slotTypeId, typeIds),
            lt(coachSlots.startsAt, to),
            gt(coachSlots.endsAt, from),
          ),
        )
        .orderBy(asc(coachSlots.startsAt));

      const durationMs = product.durationMinutes * 60_000;
      const starts: { startsAt: string; endsAt: string }[] = [];
      for (const s of slotRows) {
        const blockStart = s.startsAt.getTime();
        const blockEnd = s.endsAt.getTime();
        const blockMs = blockEnd - blockStart;
        const n = Math.floor(blockMs / durationMs);
        for (let i = 0; i < n; i += 1) {
          const startMs = blockStart + i * durationMs;
          const endMs = startMs + durationMs;
          // Clip to the requested window so a slot spanning month boundary
          // doesn't bleed into the next month's response.
          if (endMs <= from.getTime()) continue;
          if (startMs >= to.getTime()) break;
          starts.push({
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(endMs).toISOString(),
          });
        }
      }

      res.json({
        productId: id,
        durationMinutes: product.durationMinutes,
        starts,
      });
    } catch (err) {
      next(err);
    }
  },
);
