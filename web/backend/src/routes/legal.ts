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

// Public HTML pages — Google Play and other stores require the privacy
// policy URL to be reachable via a normal browser, not just from the app.
// Nginx routes /api/* → backend stripping the prefix, so the external URL is
// https://app.zhannaslyamova.net/api/<slug>. Pages are intentionally minimal
// (no nav, no JS) so they remain reachable when the SPA bundle is offline.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapLegalHtml(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 720px; margin: 0 auto; padding: 32px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.55; color: #1f2937; }
  h1 { font-size: 28px; margin: 0 0 16px; }
  h2 { font-size: 19px; margin: 28px 0 10px; }
  p, ul { margin: 10px 0; }
  ul { padding-left: 22px; }
  li { margin: 6px 0; }
  a { color: #5b21b6; }
  em { color: #6b7280; font-style: italic; }
</style>
</head>
<body>${contentHtml}</body>
</html>`;
}

const PUBLIC_HTML_SLUGS = ["privacy", "terms", "offer", "about"] as const;
for (const slug of PUBLIC_HTML_SLUGS) {
  legalRouter.get(`/${slug}`, async (_req, res, next) => {
    try {
      const [row] = await db
        .select({
          title: legalDocuments.title,
          contentHtml: legalDocuments.contentHtml,
        })
        .from(legalDocuments)
        .where(eq(legalDocuments.slug, slug))
        .limit(1);
      if (!row) {
        res.status(404).type("text/plain").send("Document not found");
        return;
      }
      res.type("text/html; charset=utf-8").send(
        wrapLegalHtml(row.title, row.contentHtml),
      );
    } catch (err) {
      next(err);
    }
  });
}

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
