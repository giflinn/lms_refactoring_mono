import { Router } from "express";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import {
  productCategories,
  products,
  productCoverKindEnum,
  productSlotTypes,
  slotTypes,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
import {
  deleteProductImage,
  persistProductImage,
  productImageUpload,
} from "../services/productImageUpload";

export const productsRouter = Router();

const TITLE_MAX = 120;
const SUBTITLE_MAX = 60;
const BUTTON_MAX = 40;
const DESCRIPTION_MAX = 2000;
const MAX_DAYS_UNTIL_CANCEL = 365;
// Soft cap on a single coaching session length. 10h fits any sane format
// (immersions, day-long retreats); above this is almost certainly a typo.
const MAX_DURATION_MINUTES = 600;

type CoverKind = (typeof productCoverKindEnum.enumValues)[number];
const COVER_KINDS: ReadonlySet<CoverKind> = new Set([
  "preset",
  "custom_bg",
  "custom_full",
]);

type ProductRow = typeof products.$inferSelect;
type CategorySummary = { id: string; name: string };

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
    // numeric column comes back as string in pg; expose it as-is so the
    // frontend can format. null = "по запросу".
    price: p.price,
    daysUntilCancel: p.daysUntilCancel,
    durationMinutes: p.durationMinutes,
    slotTypeIds,
    isPromo: p.isPromo,
    isActive: p.isActive,
    isTopSearch: p.isTopSearch,
    coverKind: p.coverKind,
    coverImageUrl: p.coverImageUrl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Loads m2m slot-type bindings for a given set of products in one query.
// Returns a Map keyed by productId. Empty map when productIds is empty.
async function loadSlotTypeIdsForProducts(
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

function parseBool(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}

function parsePrice(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  const s = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999) return { ok: false };
  return { ok: true, value: s };
}

// GET /products?q=&page=&pageSize=&categoryId=
productsRouter.get(
  "/products",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize ?? "10") || 10),
      );
      const categoryIdFilter =
        typeof req.query.categoryId === "string" && req.query.categoryId
          ? String(req.query.categoryId)
          : null;

      const conditions: SQL[] = [];
      if (q) {
        conditions.push(ilike(products.title, `%${q}%`));
      }
      if (categoryIdFilter) {
        conditions.push(eq(products.categoryId, categoryIdFilter));
      }
      const where = conditions.length ? and(...conditions) : undefined;

      const totalRows = await db
        .select({ total: count() })
        .from(products)
        .where(where ?? undefined);
      const total = Number(totalRows[0].total);

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
        .where(where ?? undefined)
        .orderBy(desc(products.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const slotTypeIdsByProduct = await loadSlotTypeIdsForProducts(
        rows.map((r) => r.product.id),
      );

      res.json({
        products: rows.map((r) =>
          serialize(
            r.product,
            r.category?.id ? r.category : null,
            slotTypeIdsByProduct.get(r.product.id) ?? [],
          ),
        ),
        page,
        pageSize,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

type CreateInput = {
  categoryId: string;
  title: string;
  subtitle: string | null;
  description: string;
  buttonText: string;
  price: string | null;
  daysUntilCancel: number;
  durationMinutes: number | null;
  slotTypeIds: string[];
  isPromo: boolean;
  isActive: boolean;
  isTopSearch: boolean;
  coverKind: CoverKind;
};

// Shared body parsing for create + update. Returns either the parsed input
// (with each present field) or an error code with HTTP status.
function parseBody(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; data: Partial<CreateInput> } | { ok: false; status: number; error: string } {
  const data: Partial<CreateInput> = {};

  const has = (k: string) => body[k] !== undefined;
  const required = (k: string, errCode: string) => {
    if (!partial && !has(k)) {
      return { ok: false as const, status: 400, error: errCode };
    }
    return null;
  };

  let err = required("categoryId", "category_required");
  if (err) return err;
  if (has("categoryId")) {
    const v = String(body.categoryId).trim();
    if (!v) return { ok: false, status: 400, error: "category_required" };
    data.categoryId = v;
  }

  err = required("title", "title_required");
  if (err) return err;
  if (has("title")) {
    const v = String(body.title).trim();
    if (!v) return { ok: false, status: 400, error: "title_required" };
    if (v.length > TITLE_MAX) {
      return { ok: false, status: 400, error: "title_too_long" };
    }
    data.title = v;
  }

  // subtitle is optional — empty string from multipart maps to null.
  if (has("subtitle")) {
    const v = String(body.subtitle).trim();
    if (!v) {
      data.subtitle = null;
    } else if (v.length > SUBTITLE_MAX) {
      return { ok: false, status: 400, error: "subtitle_too_long" };
    } else {
      data.subtitle = v;
    }
  } else if (!partial) {
    data.subtitle = null;
  }

  err = required("description", "description_required");
  if (err) return err;
  if (has("description")) {
    const v = String(body.description).trim();
    if (!v) return { ok: false, status: 400, error: "description_required" };
    if (v.length > DESCRIPTION_MAX) {
      return { ok: false, status: 400, error: "description_too_long" };
    }
    data.description = v;
  }

  err = required("buttonText", "button_text_required");
  if (err) return err;
  if (has("buttonText")) {
    const v = String(body.buttonText).trim();
    if (!v) return { ok: false, status: 400, error: "button_text_required" };
    if (v.length > BUTTON_MAX) {
      return { ok: false, status: 400, error: "button_text_too_long" };
    }
    data.buttonText = v;
  }

  // price is optional even on create — null = "по запросу".
  if (has("price")) {
    const parsed = parsePrice(body.price);
    if (!parsed.ok) {
      return { ok: false, status: 400, error: "invalid_price" };
    }
    data.price = parsed.value;
  } else if (!partial) {
    data.price = null;
  }

  err = required("daysUntilCancel", "days_until_cancel_required");
  if (err) return err;
  if (has("daysUntilCancel")) {
    const n = Number(body.daysUntilCancel);
    if (!Number.isInteger(n) || n < 0 || n > MAX_DAYS_UNTIL_CANCEL) {
      return { ok: false, status: 400, error: "invalid_days_until_cancel" };
    }
    data.daysUntilCancel = n;
  }

  // durationMinutes — empty string maps to null (non-bookable). Otherwise an
  // integer in [1, MAX_DURATION_MINUTES]. Required + present together with
  // slotTypeIds: see "booking pair" check below.
  if (has("durationMinutes")) {
    const raw = String(body.durationMinutes ?? "").trim();
    if (raw === "") {
      data.durationMinutes = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0 || n > MAX_DURATION_MINUTES) {
        return { ok: false, status: 400, error: "invalid_duration_minutes" };
      }
      data.durationMinutes = n;
    }
  }

  // slotTypeIds — JSON-encoded string array under a single multipart field.
  // Frontend sends "[]" when clearing.
  if (has("slotTypeIds")) {
    const raw = String(body.slotTypeIds ?? "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw === "" ? "[]" : raw);
    } catch {
      return { ok: false, status: 400, error: "invalid_slot_type_ids" };
    }
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
      return { ok: false, status: 400, error: "invalid_slot_type_ids" };
    }
    // Dedupe defensively so the m2m sync never tries to insert duplicate keys.
    data.slotTypeIds = Array.from(new Set(parsed as string[]));
  }

  // Booking-pair invariant: durationMinutes and slotTypeIds always travel
  // together so duration↔types stays consistent. The form drawer enforces
  // this client-side; reject mismatches here as a safety net.
  const hasDuration = data.durationMinutes !== undefined;
  const hasTypes = data.slotTypeIds !== undefined;
  if (hasDuration !== hasTypes) {
    return { ok: false, status: 400, error: "booking_fields_must_pair" };
  }
  if (data.durationMinutes != null && data.slotTypeIds!.length === 0) {
    return { ok: false, status: 400, error: "slot_types_required" };
  }
  if (data.durationMinutes == null && data.slotTypeIds && data.slotTypeIds.length > 0) {
    // Without a duration, slot type bindings are meaningless; force them empty.
    data.slotTypeIds = [];
  }

  if (has("isPromo")) data.isPromo = parseBool(body.isPromo);
  if (has("isActive")) data.isActive = parseBool(body.isActive);
  if (has("isTopSearch")) data.isTopSearch = parseBool(body.isTopSearch);

  err = required("coverKind", "cover_kind_required");
  if (err) return err;
  if (has("coverKind")) {
    const v = String(body.coverKind);
    if (!COVER_KINDS.has(v as CoverKind)) {
      return { ok: false, status: 400, error: "invalid_cover_kind" };
    }
    data.coverKind = v as CoverKind;
  }

  return { ok: true, data };
}

async function validateSlotTypeIds(
  ids: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (ids.length === 0) return { ok: true };
  const rows = await db
    .select({ id: slotTypes.id, archivedAt: slotTypes.archivedAt })
    .from(slotTypes)
    .where(inArray(slotTypes.id, ids));
  const foundActive = new Set(
    rows.filter((r) => r.archivedAt === null).map((r) => r.id),
  );
  for (const id of ids) {
    if (!foundActive.has(id)) {
      // Could be either missing or archived — distinguish for the form so it
      // can show the right message.
      const archived = rows.some((r) => r.id === id && r.archivedAt !== null);
      return {
        ok: false,
        status: archived ? 400 : 404,
        error: archived ? "slot_type_archived" : "slot_type_not_found",
      };
    }
  }
  return { ok: true };
}

// Replace all m2m bindings for a product. Idempotent — the delete/insert pair
// is safe to call even when nothing actually changes. Caller decides whether
// to call it (only when slotTypeIds is present in the request body).
async function syncProductSlotTypes(
  productId: string,
  slotTypeIds: string[],
): Promise<void> {
  await db
    .delete(productSlotTypes)
    .where(eq(productSlotTypes.productId, productId));
  if (slotTypeIds.length > 0) {
    await db.insert(productSlotTypes).values(
      slotTypeIds.map((id) => ({ productId, slotTypeId: id })),
    );
  }
}

async function loadCategoryOrFail(categoryId: string) {
  const rows = await db
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
    .where(eq(productCategories.id, categoryId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadWithCategory(productId: string) {
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
    .where(eq(products.id, productId))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    product: rows[0].product,
    category: rows[0].category?.id ? rows[0].category : null,
  };
}

// POST /products — multipart/form-data; field "cover" is optional. coverKind
// 'preset' → no file, 'custom_bg'/'custom_full' → file required.
productsRouter.post(
  "/products",
  requireAuth,
  requireStaffAdmin,
  productImageUpload.single("cover"),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const parsed = parseBody(body, false);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      const data = parsed.data as CreateInput;

      const category = await loadCategoryOrFail(data.categoryId);
      if (!category) {
        res.status(400).json({ error: "category_not_found" });
        return;
      }

      const isCustom =
        data.coverKind === "custom_bg" || data.coverKind === "custom_full";
      if (isCustom && !req.file) {
        res.status(400).json({ error: "cover_file_required" });
        return;
      }

      const slotTypeIds = data.slotTypeIds ?? [];
      const stValidation = await validateSlotTypeIds(slotTypeIds);
      if (!stValidation.ok) {
        res.status(stValidation.status).json({ error: stValidation.error });
        return;
      }

      const [created] = await db
        .insert(products)
        .values({
          categoryId: data.categoryId,
          title: data.title,
          subtitle: data.subtitle ?? null,
          description: data.description,
          buttonText: data.buttonText,
          price: data.price,
          daysUntilCancel: data.daysUntilCancel,
          durationMinutes: data.durationMinutes ?? null,
          isPromo: data.isPromo ?? false,
          isActive: data.isActive ?? true,
          isTopSearch: data.isTopSearch ?? false,
          coverKind: data.coverKind,
        })
        .returning();

      await syncProductSlotTypes(created.id, slotTypeIds);

      let finalRow = created;
      if (isCustom && req.file) {
        const url = await persistProductImage(created.id, req.file);
        const [updated] = await db
          .update(products)
          .set({ coverImageUrl: url, updatedAt: new Date() })
          .where(eq(products.id, created.id))
          .returning();
        finalRow = updated;
      }

      res.json({ product: serialize(finalRow, category, slotTypeIds) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /products/:id — same multipart shape as create. Any subset of fields
// may be present.
productsRouter.patch(
  "/products/:id",
  requireAuth,
  requireStaffAdmin,
  productImageUpload.single("cover"),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const existing = await loadWithCategory(id);
      if (!existing) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      const parsed = parseBody(req.body as Record<string, unknown>, true);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      const data = parsed.data;

      if (data.categoryId && data.categoryId !== existing.product.categoryId) {
        const cat = await loadCategoryOrFail(data.categoryId);
        if (!cat) {
          res.status(400).json({ error: "category_not_found" });
          return;
        }
      }

      const nextKind: CoverKind = data.coverKind ?? existing.product.coverKind;
      const kindChanged = data.coverKind && data.coverKind !== existing.product.coverKind;
      const isCustom = nextKind === "custom_bg" || nextKind === "custom_full";

      // If switching into a custom kind without a new file, we keep the old
      // image (only the kind flag flipped). If there's no old image either,
      // it's a bad request.
      if (kindChanged && isCustom && !req.file && !existing.product.coverImageUrl) {
        res.status(400).json({ error: "cover_file_required" });
        return;
      }

      if (data.slotTypeIds !== undefined) {
        const stValidation = await validateSlotTypeIds(data.slotTypeIds);
        if (!stValidation.ok) {
          res.status(stValidation.status).json({ error: stValidation.error });
          return;
        }
      }

      const patch: Partial<typeof products.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.categoryId !== undefined) patch.categoryId = data.categoryId;
      if (data.title !== undefined) patch.title = data.title;
      if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
      if (data.description !== undefined) patch.description = data.description;
      if (data.buttonText !== undefined) patch.buttonText = data.buttonText;
      if (data.price !== undefined) patch.price = data.price;
      if (data.daysUntilCancel !== undefined) patch.daysUntilCancel = data.daysUntilCancel;
      if (data.durationMinutes !== undefined) patch.durationMinutes = data.durationMinutes;
      if (data.isPromo !== undefined) patch.isPromo = data.isPromo;
      if (data.isActive !== undefined) patch.isActive = data.isActive;
      if (data.isTopSearch !== undefined) patch.isTopSearch = data.isTopSearch;
      if (data.coverKind !== undefined) patch.coverKind = data.coverKind;

      // Cover file changes: only persist if a file was uploaded AND we're in
      // a custom kind. Switching to preset clears the image (and deletes the
      // file from disk).
      if (req.file && isCustom) {
        const url = await persistProductImage(id, req.file);
        patch.coverImageUrl = url;
      } else if (nextKind === "preset" && existing.product.coverImageUrl) {
        await deleteProductImage(id);
        patch.coverImageUrl = null;
      }

      await db.update(products).set(patch).where(eq(products.id, id));

      if (data.slotTypeIds !== undefined) {
        await syncProductSlotTypes(id, data.slotTypeIds);
      }

      const refreshed = await loadWithCategory(id);
      if (!refreshed) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      const idsByProduct = await loadSlotTypeIdsForProducts([id]);

      res.json({
        product: serialize(
          refreshed.product,
          refreshed.category,
          idsByProduct.get(id) ?? [],
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /products/:id — hard delete (no orders/FK exist yet). When orders
// land we'll switch to soft-delete with deletedAt.
productsRouter.delete(
  "/products/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const rows = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      if (rows.length === 0) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      await db.delete(products).where(eq(products.id, id));
      await deleteProductImage(id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
