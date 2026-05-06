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
  coachBookings,
  coachSlots,
  productCategories,
  products,
  productSlotTypes,
  telegramGroups,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const clientCatalogRouter = Router();

const SEARCH_LIMIT = 50;
const TOP_SEARCH_LIMIT = 10;

type ProductRow = typeof products.$inferSelect;
type CategorySummary = { id: string; name: string };
type TelegramGroupSummary = {
  id: string;
  title: string;
  chatType: "channel" | "supergroup";
  description: string | null;
};

// Catalog payload shape mirrors the admin /products serializer minus the
// price-tag we don't yet show on mobile, but kept identical so a future
// mobile-side checkout can reuse the same model.
function serialize(
  p: ProductRow,
  category: CategorySummary | null,
  slotTypeIds: string[],
  telegramGroup: TelegramGroupSummary | null,
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
    telegramGroupId: p.telegramGroupId,
    telegramGroup,
    isPromo: p.isPromo,
    isTopSearch: p.isTopSearch,
    coverKind: p.coverKind,
    coverImageUrl: p.coverImageUrl,
  };
}

async function loadTelegramGroupsForProducts(
  productRows: ProductRow[],
): Promise<Map<string, TelegramGroupSummary>> {
  const out = new Map<string, TelegramGroupSummary>();
  const ids = Array.from(
    new Set(
      productRows
        .map((p) => p.telegramGroupId)
        .filter((id): id is string => id !== null),
    ),
  );
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: telegramGroups.id,
      title: telegramGroups.title,
      chatType: telegramGroups.chatType,
      description: telegramGroups.description,
    })
    .from(telegramGroups)
    .where(inArray(telegramGroups.id, ids));
  for (const r of rows) out.set(r.id, r);
  return out;
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
    const tgGroups = await loadTelegramGroupsForProducts(
      productRows.map((r) => r.product),
    );

    res.json({
      categories: categoryRows,
      products: productRows.map((r) =>
        serialize(
          r.product,
          r.category?.id ? r.category : null,
          idsByProduct.get(r.product.id) ?? [],
          r.product.telegramGroupId
            ? tgGroups.get(r.product.telegramGroupId) ?? null
            : null,
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
      const tgGroups = await loadTelegramGroupsForProducts(
        rows.map((r) => r.product),
      );

      res.json({
        products: rows.map((r) =>
          serialize(
            r.product,
            r.category?.id ? r.category : null,
            idsByProduct.get(r.product.id) ?? [],
            r.product.telegramGroupId
              ? tgGroups.get(r.product.telegramGroupId) ?? null
              : null,
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
      const tgGroups = await loadTelegramGroupsForProducts(
        rows.map((r) => r.product),
      );

      res.json({
        products: rows.map((r) =>
          serialize(
            r.product,
            r.category?.id ? r.category : null,
            idsByProduct.get(r.product.id) ?? [],
            r.product.telegramGroupId
              ? tgGroups.get(r.product.telegramGroupId) ?? null
              : null,
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
          id: coachSlots.id,
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

      // Active bookings inside those slots — we subtract them from the
      // chunked starts so an already-purchased sub-range doesn't show up
      // as bookable for another client.
      const bookingsBySlot = new Map<string, { startMs: number; endMs: number }[]>();
      if (slotRows.length > 0) {
        const bookingRows = await db
          .select({
            coachSlotId: coachBookings.coachSlotId,
            startsAt: coachBookings.startsAt,
            endsAt: coachBookings.endsAt,
          })
          .from(coachBookings)
          .where(
            and(
              eq(coachBookings.status, "active"),
              inArray(
                coachBookings.coachSlotId,
                slotRows.map((s) => s.id),
              ),
            ),
          );
        for (const b of bookingRows) {
          const list = bookingsBySlot.get(b.coachSlotId);
          const interval = {
            startMs: b.startsAt.getTime(),
            endMs: b.endsAt.getTime(),
          };
          if (list) list.push(interval);
          else bookingsBySlot.set(b.coachSlotId, [interval]);
        }
      }

      const durationMs = product.durationMinutes * 60_000;
      const nowMs = Date.now();
      const starts: { startsAt: string; endsAt: string }[] = [];
      for (const s of slotRows) {
        const blockStart = s.startsAt.getTime();
        const blockEnd = s.endsAt.getTime();
        const blockMs = blockEnd - blockStart;
        const n = Math.floor(blockMs / durationMs);
        const slotBookings = bookingsBySlot.get(s.id) ?? [];
        for (let i = 0; i < n; i += 1) {
          const startMs = blockStart + i * durationMs;
          const endMs = startMs + durationMs;
          // Clip to the requested window so a slot spanning month boundary
          // doesn't bleed into the next month's response.
          if (endMs <= from.getTime()) continue;
          if (startMs >= to.getTime()) break;
          // Skip starts that have already begun. The current month's `from`
          // is the 1st of the month at 00:00, so without this check the
          // earlier days of the current month would surface as bookable
          // — which they aren't.
          if (startMs < nowMs) continue;
          // Skip chunks that overlap an active booking inside this slot.
          let booked = false;
          for (const bk of slotBookings) {
            if (bk.startMs < endMs && bk.endMs > startMs) {
              booked = true;
              break;
            }
          }
          if (booked) continue;
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
