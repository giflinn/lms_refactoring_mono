// Mobile-facing LMS endpoints. The user has access to a course iff they own
// at least one paid + active order_item whose product.lms_course_id == course.
// We don't materialise a separate "enrollment" record — order state is the
// authority, same as for Telegram-grant access.

import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  lmsCourses,
  lmsLessonAttachments,
  lmsLessons,
  lmsModules,
  orderItems,
  orders,
  products,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";

export const meLmsRouter = Router();

type CourseRow = typeof lmsCourses.$inferSelect;
type LessonRow = typeof lmsLessons.$inferSelect;
type AttachmentRow = typeof lmsLessonAttachments.$inferSelect;

// Returns true iff the actor owns at least one fulfilment_status='active' +
// payment_status='paid' order_item linked (via product.lms_course_id) to the
// course. This is the access check for /me/courses/:id and /me/lessons/:id.
async function userOwnsCourse(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(
      and(
        eq(orders.clientId, userId),
        eq(orders.paymentStatus, "paid"),
        eq(orders.fulfillmentStatus, "active"),
        eq(products.lmsCourseId, courseId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// GET /me/courses — список курсов, к которым у пользователя есть активный
// доступ через order_items. Возвращает плоский список карточек.
meLmsRouter.get(
  "/me/courses",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const actorId = req.actorId as string;
      const rows = await db
        .selectDistinct({
          id: lmsCourses.id,
          title: lmsCourses.title,
          description: lmsCourses.description,
          coverImageUrl: lmsCourses.coverImageUrl,
          createdAt: lmsCourses.createdAt,
        })
        .from(lmsCourses)
        .innerJoin(products, eq(products.lmsCourseId, lmsCourses.id))
        .innerJoin(orderItems, eq(orderItems.productId, products.id))
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orders.clientId, actorId),
            eq(orders.paymentStatus, "paid"),
            eq(orders.fulfillmentStatus, "active"),
          ),
        )
        .orderBy(desc(lmsCourses.createdAt));
      res.json({ courses: rows });
    } catch (err) {
      next(err);
    }
  },
);

// GET /me/courses/:id — full tree (modules + lesson titles, no HTML).
meLmsRouter.get(
  "/me/courses/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const actorId = req.actorId as string;
      const courseId = req.params.id;

      if (!(await userOwnsCourse(actorId, courseId))) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }

      const [course] = await db
        .select()
        .from(lmsCourses)
        .where(eq(lmsCourses.id, courseId))
        .limit(1);
      if (!course) {
        res.status(404).json({ error: "course_not_found" });
        return;
      }

      const moduleRows = await db
        .select()
        .from(lmsModules)
        .where(eq(lmsModules.courseId, courseId))
        .orderBy(asc(lmsModules.sortOrder), asc(lmsModules.createdAt));

      const moduleIds = moduleRows.map((m) => m.id);
      const lessonRows =
        moduleIds.length === 0
          ? []
          : await db
              .select({
                id: lmsLessons.id,
                moduleId: lmsLessons.moduleId,
                title: lmsLessons.title,
                sortOrder: lmsLessons.sortOrder,
              })
              .from(lmsLessons)
              .where(inArray(lmsLessons.moduleId, moduleIds))
              .orderBy(asc(lmsLessons.sortOrder), asc(lmsLessons.createdAt));

      const lessonsByModule = new Map<
        string,
        { id: string; title: string; sortOrder: number }[]
      >();
      for (const l of lessonRows) {
        const list = lessonsByModule.get(l.moduleId) ?? [];
        list.push({ id: l.id, title: l.title, sortOrder: l.sortOrder });
        lessonsByModule.set(l.moduleId, list);
      }

      res.json({
        course: serializeCourse(course),
        modules: moduleRows.map((m) => ({
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          lessons: lessonsByModule.get(m.id) ?? [],
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

function serializeCourse(c: CourseRow) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    coverImageUrl: c.coverImageUrl,
  };
}

// GET /me/lessons/:id — single lesson with HTML body. Ownership is checked
// transitively via the lesson's module → course.
meLmsRouter.get(
  "/me/lessons/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const actorId = req.actorId as string;
      const lessonId = req.params.id;

      const rows = await db
        .select({
          lesson: lmsLessons,
          courseId: lmsModules.courseId,
        })
        .from(lmsLessons)
        .innerJoin(lmsModules, eq(lmsModules.id, lmsLessons.moduleId))
        .where(eq(lmsLessons.id, lessonId))
        .limit(1);
      if (rows.length === 0) {
        res.status(404).json({ error: "lesson_not_found" });
        return;
      }
      const row = rows[0];
      if (!(await userOwnsCourse(actorId, row.courseId))) {
        res.status(404).json({ error: "lesson_not_found" });
        return;
      }
      const attachments = await db
        .select()
        .from(lmsLessonAttachments)
        .where(eq(lmsLessonAttachments.lessonId, row.lesson.id))
        .orderBy(
          asc(lmsLessonAttachments.sortOrder),
          asc(lmsLessonAttachments.createdAt),
        );
      res.json({
        lesson: serializeLessonFull(row.lesson, row.courseId, attachments),
      });
    } catch (err) {
      next(err);
    }
  },
);

function serializeLessonFull(
  l: LessonRow,
  courseId: string,
  attachments: AttachmentRow[],
) {
  return {
    id: l.id,
    moduleId: l.moduleId,
    courseId,
    title: l.title,
    contentHtml: l.contentHtml,
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      urlPath: a.urlPath,
      sortOrder: a.sortOrder,
    })),
  };
}

