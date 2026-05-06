import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaff } from "../middleware/requireRole";
import {
  ReviewError,
  ReviewStatus,
  StaffRole,
  deleteReply,
  deleteReviewByClient,
  editReview,
  listMyReviews,
  listProductReviews,
  listStaffReviews,
  moderateReview,
  pendingReviewsCount,
  replyToReview,
  submitReview,
} from "../services/reviewService";

export const reviewsRouter = Router();

const VALID_STATUSES: ReadonlySet<ReviewStatus> = new Set([
  "pending",
  "published",
  "deleted",
]);

function reviewErrorToHttp(err: ReviewError): {
  status: number;
  body: { error: string; details?: unknown };
} {
  switch (err.code) {
    case "review_not_found":
    case "reply_not_found":
    case "no_completed_order":
      return { status: 404, body: { error: err.code } };
    case "forbidden":
      return { status: 403, body: { error: err.code } };
    case "review_deleted":
    case "review_not_published":
      return { status: 409, body: { error: err.code } };
    default:
      return { status: 400, body: { error: err.code, details: err.details } };
  }
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// =========================================================================
// Client (mobile) endpoints
// =========================================================================

// POST /me/reviews — body: { productId, rating, text }
reviewsRouter.post(
  "/me/reviews",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const productId =
        typeof body.productId === "string" ? body.productId : null;
      const rating = typeof body.rating === "number" ? body.rating : NaN;
      const text = typeof body.text === "string" ? body.text : "";

      if (!productId) {
        res.status(400).json({ error: "missing_fields" });
        return;
      }

      const result = await submitReview({
        clientId: actorId,
        productId,
        rating,
        text,
      });
      res.json({ review: { id: result.id } });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// GET /me/reviews — calling client's own reviews (all statuses except deleted)
reviewsRouter.get(
  "/me/reviews",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const reviews = await listMyReviews({ clientId: actorId });
      res.json({ reviews });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /me/reviews/:id — body: { rating, text }
reviewsRouter.patch(
  "/me/reviews/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rating = typeof body.rating === "number" ? body.rating : NaN;
      const text = typeof body.text === "string" ? body.text : "";

      await editReview({
        reviewId: req.params.id,
        clientId: actorId,
        rating,
        text,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// DELETE /me/reviews/:id — soft delete
reviewsRouter.delete(
  "/me/reviews/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      await deleteReviewByClient({
        reviewId: req.params.id,
        clientId: actorId,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// =========================================================================
// Public feed (no auth — anyone visiting the product page can read reviews)
// =========================================================================

// GET /products/:id/reviews?cursor=&limit=
reviewsRouter.get("/products/:id/reviews", async (req, res, next) => {
  try {
    const productId = req.params.id;
    const limit = asNumber(req.query.limit, 20);
    const cursorRaw =
      typeof req.query.cursor === "string" && req.query.cursor
        ? req.query.cursor
        : null;
    const cursor = cursorRaw ? new Date(cursorRaw) : null;
    if (cursor && Number.isNaN(cursor.getTime())) {
      res.status(400).json({ error: "invalid_cursor" });
      return;
    }

    const result = await listProductReviews({ productId, cursor, limit });
    res.json({
      reviews: result.reviews,
      nextCursor: result.nextCursor ? result.nextCursor.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// Staff endpoints
// =========================================================================

// GET /reviews?status=&q=&clientId=&page=&pageSize= — staff list (manager-scoped)
reviewsRouter.get(
  "/reviews",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const statusRaw =
        typeof req.query.status === "string" && req.query.status
          ? req.query.status
          : null;
      const status =
        statusRaw && VALID_STATUSES.has(statusRaw as ReviewStatus)
          ? (statusRaw as ReviewStatus)
          : null;
      const q = typeof req.query.q === "string" ? req.query.q : null;
      const clientId =
        typeof req.query.clientId === "string" && req.query.clientId
          ? req.query.clientId
          : null;
      const page = Math.max(1, asNumber(req.query.page, 1));
      const pageSize = Math.min(
        50,
        Math.max(1, asNumber(req.query.pageSize, 20)),
      );

      const result = await listStaffReviews({
        actorId,
        actorRole,
        status,
        q,
        clientId,
        page,
        pageSize,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /reviews/pending-count — drives the staff bottom-nav badge
reviewsRouter.get(
  "/reviews/pending-count",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const total = await pendingReviewsCount({ actorId, actorRole });
      res.json({ total });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /reviews/:id — body: { action: 'publish'|'delete' }
reviewsRouter.patch(
  "/reviews/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = body.action;
      if (action !== "publish" && action !== "delete") {
        res.status(400).json({ error: "invalid_action" });
        return;
      }
      await moderateReview({
        reviewId: req.params.id,
        action,
        actorId,
        actorRole,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// POST /reviews/:id/reply — body: { text }
reviewsRouter.post(
  "/reviews/:id/reply",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const text = typeof body.text === "string" ? body.text : "";

      const result = await replyToReview({
        reviewId: req.params.id,
        authorId: actorId,
        authorRole: actorRole,
        text,
      });
      res.json({ reply: { id: result.id } });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// DELETE /reviews/replies/:replyId
reviewsRouter.delete(
  "/reviews/replies/:replyId",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      await deleteReply({
        replyId: req.params.replyId,
        requesterId: actorId,
        requesterRole: actorRole,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ReviewError) {
        const { status, body } = reviewErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);
