import { Router } from "express";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  lmsCourses,
  lmsLessons,
  lmsModules,
  products,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
import {
  deleteLmsCover,
  isMediaImage,
  isMediaVideo,
  lmsCoverUpload,
  lmsMediaUpload,
  persistLmsCover,
  persistLmsMedia,
} from "../services/lmsUpload";

export const lmsRouter = Router();

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const HTML_MAX = 100_000;

type CourseRow = typeof lmsCourses.$inferSelect;
type ModuleRow = typeof lmsModules.$inferSelect;
type LessonRow = typeof lmsLessons.$inferSelect;

function serializeCourse(c: CourseRow, productsCount: number) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    coverImageUrl: c.coverImageUrl,
    archivedAt: c.archivedAt,
    productsCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function serializeModule(m: ModuleRow, lessonsCount: number) {
  return {
    id: m.id,
    courseId: m.courseId,
    title: m.title,
    sortOrder: m.sortOrder,
    lessonsCount,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function serializeLessonSummary(l: LessonRow) {
  return {
    id: l.id,
    moduleId: l.moduleId,
    title: l.title,
    sortOrder: l.sortOrder,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function serializeLessonFull(l: LessonRow) {
  return { ...serializeLessonSummary(l), contentHtml: l.contentHtml };
}

async function loadCourseProductsCount(
  courseIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (courseIds.length === 0) return out;
  const rows = await db
    .select({
      courseId: products.lmsCourseId,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(inArray(products.lmsCourseId, courseIds))
    .groupBy(products.lmsCourseId);
  for (const r of rows) {
    if (r.courseId) out.set(r.courseId, Number(r.count));
  }
  return out;
}

// ---------- courses ----------

// GET /lms/courses — admin list (active first, archived after)
lmsRouter.get(
  "/lms/courses",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(lmsCourses)
        .orderBy(asc(lmsCourses.archivedAt), desc(lmsCourses.createdAt));
      const counts = await loadCourseProductsCount(rows.map((r) => r.id));
      res.json({
        courses: rows.map((r) => serializeCourse(r, counts.get(r.id) ?? 0)),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /lms/courses/picker — slim payload for the product form drawer.
// Returns active courses only, sorted by title.
lmsRouter.get(
  "/lms/courses/picker",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({ id: lmsCourses.id, title: lmsCourses.title })
        .from(lmsCourses)
        .where(isNull(lmsCourses.archivedAt))
        .orderBy(asc(lmsCourses.title));
      res.json({ courses: rows });
    } catch (err) {
      next(err);
    }
  },
);

type CourseInput = { title: string; description: string | null };

function parseCourseBody(
  body: Record<string, unknown>,
  partial: boolean,
):
  | { ok: true; data: Partial<CourseInput> }
  | { ok: false; status: number; error: string } {
  const data: Partial<CourseInput> = {};
  const has = (k: string) => body[k] !== undefined;

  if (!partial && !has("title")) {
    return { ok: false, status: 400, error: "title_required" };
  }
  if (has("title")) {
    const v = String(body.title).trim();
    if (!v) return { ok: false, status: 400, error: "title_required" };
    if (v.length > TITLE_MAX) {
      return { ok: false, status: 400, error: "title_too_long" };
    }
    data.title = v;
  }

  if (has("description")) {
    const raw = body.description;
    if (raw === null || raw === undefined || raw === "") {
      data.description = null;
    } else {
      const v = String(raw).trim();
      if (v.length > DESCRIPTION_MAX) {
        return { ok: false, status: 400, error: "description_too_long" };
      }
      data.description = v || null;
    }
  } else if (!partial) {
    data.description = null;
  }

  return { ok: true, data };
}

// POST /lms/courses — multipart; field "cover" optional.
lmsRouter.post(
  "/lms/courses",
  requireAuth,
  requireStaffAdmin,
  lmsCoverUpload.single("cover"),
  async (req, res, next) => {
    try {
      const parsed = parseCourseBody(req.body as Record<string, unknown>, false);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      const data = parsed.data as CourseInput;

      const [created] = await db
        .insert(lmsCourses)
        .values({
          title: data.title,
          description: data.description,
        })
        .returning();

      let finalRow = created;
      if (req.file) {
        const url = await persistLmsCover(created.id, req.file);
        const [updated] = await db
          .update(lmsCourses)
          .set({ coverImageUrl: url, updatedAt: new Date() })
          .where(eq(lmsCourses.id, created.id))
          .returning();
        finalRow = updated;
      }

      res.json({ course: serializeCourse(finalRow, 0) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /lms/courses/:id — admin detail with full module/lesson tree (no
// lesson HTML — that's per-lesson on demand).
lmsRouter.get(
  "/lms/courses/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [course] = await db
        .select()
        .from(lmsCourses)
        .where(eq(lmsCourses.id, id))
        .limit(1);
      if (!course) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }

      const moduleRows = await db
        .select()
        .from(lmsModules)
        .where(eq(lmsModules.courseId, id))
        .orderBy(asc(lmsModules.sortOrder), asc(lmsModules.createdAt));

      const moduleIds = moduleRows.map((m) => m.id);
      const lessonRows =
        moduleIds.length === 0
          ? []
          : await db
              .select()
              .from(lmsLessons)
              .where(inArray(lmsLessons.moduleId, moduleIds))
              .orderBy(asc(lmsLessons.sortOrder), asc(lmsLessons.createdAt));

      const lessonsByModule = new Map<string, LessonRow[]>();
      for (const l of lessonRows) {
        const list = lessonsByModule.get(l.moduleId) ?? [];
        list.push(l);
        lessonsByModule.set(l.moduleId, list);
      }
      const counts = await loadCourseProductsCount([id]);
      res.json({
        course: serializeCourse(course, counts.get(id) ?? 0),
        modules: moduleRows.map((m) => ({
          ...serializeModule(m, lessonsByModule.get(m.id)?.length ?? 0),
          lessons: (lessonsByModule.get(m.id) ?? []).map(serializeLessonSummary),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /lms/courses/:id — body fields any subset of {title, description,
// archived}. Cover handled by the multipart layer (same pattern as products).
lmsRouter.patch(
  "/lms/courses/:id",
  requireAuth,
  requireStaffAdmin,
  lmsCoverUpload.single("cover"),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [existing] = await db
        .select()
        .from(lmsCourses)
        .where(eq(lmsCourses.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const parsed = parseCourseBody(body, true);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      const data = parsed.data;

      const patch: Partial<typeof lmsCourses.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.title !== undefined) patch.title = data.title;
      if (data.description !== undefined) patch.description = data.description;

      // Archive toggle is its own field so the form can flip it independently
      // of editing other fields.
      if (body.archived !== undefined) {
        const want = body.archived === true || body.archived === "true";
        patch.archivedAt = want
          ? existing.archivedAt ?? new Date()
          : null;
      }

      if (req.file) {
        const url = await persistLmsCover(id, req.file);
        patch.coverImageUrl = url;
      }
      // body.removeCover='true' wipes the cover file + url. Lets the admin
      // revert to the gradient placeholder without uploading a replacement.
      if (
        body.removeCover === "true" ||
        body.removeCover === true
      ) {
        await deleteLmsCover(id);
        patch.coverImageUrl = null;
      }

      const [updated] = await db
        .update(lmsCourses)
        .set(patch)
        .where(eq(lmsCourses.id, id))
        .returning();
      const counts = await loadCourseProductsCount([id]);
      res.json({ course: serializeCourse(updated, counts.get(id) ?? 0) });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /lms/courses/:id — soft-delete (archive). Hard delete is refused
// by the FK from products(lms_course_id) → courses(id) ON DELETE RESTRICT.
lmsRouter.delete(
  "/lms/courses/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [existing] = await db
        .select()
        .from(lmsCourses)
        .where(eq(lmsCourses.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }
      await db
        .update(lmsCourses)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(lmsCourses.id, id));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- modules ----------

async function nextSortOrderForModules(courseId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${lmsModules.sortOrder})` })
    .from(lmsModules)
    .where(eq(lmsModules.courseId, courseId));
  return Number(rows[0]?.max ?? -1) + 1;
}

async function nextSortOrderForLessons(moduleId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${lmsLessons.sortOrder})` })
    .from(lmsLessons)
    .where(eq(lmsLessons.moduleId, moduleId));
  return Number(rows[0]?.max ?? -1) + 1;
}

// POST /lms/courses/:courseId/modules — body: {title}
lmsRouter.post(
  "/lms/courses/:courseId/modules",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const courseId = req.params.courseId;
      const [course] = await db
        .select({ id: lmsCourses.id })
        .from(lmsCourses)
        .where(eq(lmsCourses.id, courseId))
        .limit(1);
      if (!course) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        res.status(400).json({ error: "title_required" });
        return;
      }
      if (title.length > TITLE_MAX) {
        res.status(400).json({ error: "title_too_long" });
        return;
      }
      const sortOrder = await nextSortOrderForModules(courseId);
      const [created] = await db
        .insert(lmsModules)
        .values({ courseId, title, sortOrder })
        .returning();
      res.json({ module: serializeModule(created, 0) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /lms/modules/:id — body: {title}
lmsRouter.patch(
  "/lms/modules/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [existing] = await db
        .select()
        .from(lmsModules)
        .where(eq(lmsModules.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "module_not_found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const patch: Partial<typeof lmsModules.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) {
        const v = String(body.title).trim();
        if (!v) {
          res.status(400).json({ error: "title_required" });
          return;
        }
        if (v.length > TITLE_MAX) {
          res.status(400).json({ error: "title_too_long" });
          return;
        }
        patch.title = v;
      }
      const [updated] = await db
        .update(lmsModules)
        .set(patch)
        .where(eq(lmsModules.id, id))
        .returning();
      // count from existing — patch doesn't move lessons
      const lessons = await db
        .select({ id: lmsLessons.id })
        .from(lmsLessons)
        .where(eq(lmsLessons.moduleId, id));
      res.json({ module: serializeModule(updated, lessons.length) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /lms/courses/:courseId/modules/order — body: {ids: string[]}.
// Reassigns sort_order to match the position of each id in the array.
lmsRouter.patch(
  "/lms/courses/:courseId/modules/order",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const courseId = req.params.courseId;
      const body = req.body as Record<string, unknown>;
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]) : null;
      if (!ids || !ids.every((v): v is string => typeof v === "string")) {
        res.status(400).json({ error: "invalid_ids" });
        return;
      }
      const rows = await db
        .select({ id: lmsModules.id })
        .from(lmsModules)
        .where(eq(lmsModules.courseId, courseId));
      const owned = new Set(rows.map((r) => r.id));
      for (const id of ids) {
        if (!owned.has(id)) {
          res.status(400).json({ error: "module_not_in_course" });
          return;
        }
      }
      // Reorder inside a single round-trip — small N (≤ a few dozen).
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(lmsModules)
            .set({ sortOrder: i, updatedAt: new Date() })
            .where(eq(lmsModules.id, ids[i] as string));
        }
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /lms/modules/:id — hard delete. Lessons cascade.
lmsRouter.delete(
  "/lms/modules/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const result = await db.delete(lmsModules).where(eq(lmsModules.id, id));
      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "module_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- lessons ----------

// POST /lms/modules/:moduleId/lessons — body: {title, contentHtml?}
lmsRouter.post(
  "/lms/modules/:moduleId/lessons",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const moduleId = req.params.moduleId;
      const [mod] = await db
        .select({ id: lmsModules.id })
        .from(lmsModules)
        .where(eq(lmsModules.id, moduleId))
        .limit(1);
      if (!mod) {
        res.status(404).json({ error: "module_not_found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        res.status(400).json({ error: "title_required" });
        return;
      }
      if (title.length > TITLE_MAX) {
        res.status(400).json({ error: "title_too_long" });
        return;
      }
      const html =
        typeof body.contentHtml === "string" ? body.contentHtml : "";
      if (html.length > HTML_MAX) {
        res.status(400).json({ error: "content_too_long" });
        return;
      }
      const sortOrder = await nextSortOrderForLessons(moduleId);
      const [created] = await db
        .insert(lmsLessons)
        .values({ moduleId, title, contentHtml: html, sortOrder })
        .returning();
      res.json({ lesson: serializeLessonFull(created) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /lms/lessons/:id — admin: full content for the editor.
lmsRouter.get(
  "/lms/lessons/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [lesson] = await db
        .select()
        .from(lmsLessons)
        .where(eq(lmsLessons.id, id))
        .limit(1);
      if (!lesson) {
        res.status(404).json({ error: "lesson_not_found" });
        return;
      }
      res.json({ lesson: serializeLessonFull(lesson) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /lms/lessons/:id — body fields any subset of {title, contentHtml}
lmsRouter.patch(
  "/lms/lessons/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const [existing] = await db
        .select()
        .from(lmsLessons)
        .where(eq(lmsLessons.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "lesson_not_found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const patch: Partial<typeof lmsLessons.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) {
        const v = String(body.title).trim();
        if (!v) {
          res.status(400).json({ error: "title_required" });
          return;
        }
        if (v.length > TITLE_MAX) {
          res.status(400).json({ error: "title_too_long" });
          return;
        }
        patch.title = v;
      }
      if (body.contentHtml !== undefined) {
        const v = typeof body.contentHtml === "string" ? body.contentHtml : "";
        if (v.length > HTML_MAX) {
          res.status(400).json({ error: "content_too_long" });
          return;
        }
        patch.contentHtml = v;
      }
      const [updated] = await db
        .update(lmsLessons)
        .set(patch)
        .where(eq(lmsLessons.id, id))
        .returning();
      res.json({ lesson: serializeLessonFull(updated) });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /lms/modules/:moduleId/lessons/order — body: {ids: string[]}
lmsRouter.patch(
  "/lms/modules/:moduleId/lessons/order",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const moduleId = req.params.moduleId;
      const body = req.body as Record<string, unknown>;
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]) : null;
      if (!ids || !ids.every((v): v is string => typeof v === "string")) {
        res.status(400).json({ error: "invalid_ids" });
        return;
      }
      const rows = await db
        .select({ id: lmsLessons.id })
        .from(lmsLessons)
        .where(eq(lmsLessons.moduleId, moduleId));
      const owned = new Set(rows.map((r) => r.id));
      for (const id of ids) {
        if (!owned.has(id)) {
          res.status(400).json({ error: "lesson_not_in_module" });
          return;
        }
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(lmsLessons)
            .set({ sortOrder: i, updatedAt: new Date() })
            .where(eq(lmsLessons.id, ids[i] as string));
        }
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /lms/lessons/:id
lmsRouter.delete(
  "/lms/lessons/:id",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const result = await db.delete(lmsLessons).where(eq(lmsLessons.id, id));
      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "lesson_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- media ----------

// POST /lms/media — single file upload from the TipTap editor. Returns the
// public URL the editor inlines into <img>/<video> tags. Two `kind` hints
// help the UI pre-pick the right node (img/video) without re-checking mime.
lmsRouter.post(
  "/lms/media",
  requireAuth,
  requireStaffAdmin,
  lmsMediaUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "file_required" });
        return;
      }
      const { url, mime } = await persistLmsMedia(req.file);
      const kind = isMediaImage(mime)
        ? "image"
        : isMediaVideo(mime)
          ? "video"
          : "file";
      res.json({ url, mime, kind });
    } catch (err) {
      next(err);
    }
  },
);

