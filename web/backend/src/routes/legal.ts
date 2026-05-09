import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { legalDocuments } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";

export const legalRouter = Router();

const VALID_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "privacy",
  "terms",
  "offer",
]);

// Body cap: legal docs are HTML, but we don't want to accept arbitrary
// blobs. 200 KB is generous for any reasonable policy/offer.
const MAX_HTML_BYTES = 200_000;

// GET /legal — list all 4 docs (slug + title + updatedAt). Public so the
// admin UI doesn't need a separate list endpoint behind auth, and so future
// public pages (web "Публичная оферта" footer link, etc.) can render a list
// without forcing sign-in.
legalRouter.get("/legal", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        slug: legalDocuments.slug,
        title: legalDocuments.title,
        updatedAt: legalDocuments.updatedAt,
      })
      .from(legalDocuments)
      .orderBy(asc(legalDocuments.slug));
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

// GET /legal/:slug — public. Mobile fetches without auth so the documents
// can render during registration / before sign-in.
legalRouter.get("/legal/:slug", async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    if (!VALID_SLUGS.has(slug)) {
      res.status(404).json({ error: "document_not_found" });
      return;
    }
    const [row] = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.slug, slug))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "document_not_found" });
      return;
    }
    res.json({
      document: {
        slug: row.slug,
        title: row.title,
        contentHtml: row.contentHtml,
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /legal/:slug — admin only. Body: { title?: string, contentHtml: string }
legalRouter.patch(
  "/legal/:slug",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const slug = String(req.params.slug);
      if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: "document_not_found" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;

      const titleRaw = body.title;
      const title =
        typeof titleRaw === "string" ? titleRaw.trim().slice(0, 200) : null;

      const htmlRaw = body.contentHtml;
      if (typeof htmlRaw !== "string") {
        res.status(400).json({ error: "content_required" });
        return;
      }
      if (Buffer.byteLength(htmlRaw, "utf8") > MAX_HTML_BYTES) {
        res.status(400).json({ error: "content_too_long" });
        return;
      }

      const update: Partial<typeof legalDocuments.$inferInsert> = {
        contentHtml: htmlRaw,
        updatedAt: new Date(),
        updatedByUserId: req.actorId as string,
      };
      if (title !== null && title.length > 0) {
        update.title = title;
      }

      const updated = await db
        .update(legalDocuments)
        .set(update)
        .where(eq(legalDocuments.slug, slug))
        .returning({ slug: legalDocuments.slug });

      if (updated.length === 0) {
        res.status(404).json({ error: "document_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
