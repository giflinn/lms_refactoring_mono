import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  orderItems,
  orders,
  productReviewReplies,
  productReviews,
  products,
  users,
} from "../db/schema";
import { sendPushToUser } from "./push";

export type ReviewStatus = "pending" | "published" | "deleted";
export type StaffRole = "manager" | "senior_manager" | "admin";

export class ReviewError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, details?: unknown) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

const REVIEW_TEXT_MIN = 10;
const REVIEW_TEXT_MAX = 1000;
const REPLY_TEXT_MIN = 1;
const REPLY_TEXT_MAX = 500;

const reviewClientUsers = alias(users, "review_client_users");
const replyAuthorUsers = alias(users, "review_reply_author_users");

function validateReviewText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < REVIEW_TEXT_MIN) throw new ReviewError("text_too_short");
  if (trimmed.length > REVIEW_TEXT_MAX) throw new ReviewError("text_too_long");
  return trimmed;
}

function validateRating(input: number): number {
  if (!Number.isInteger(input) || input < 1 || input > 5) {
    throw new ReviewError("invalid_rating");
  }
  return input;
}

function validateReplyText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < REPLY_TEXT_MIN) throw new ReviewError("text_too_short");
  if (trimmed.length > REPLY_TEXT_MAX) throw new ReviewError("text_too_long");
  return trimmed;
}

// =========================================================================
// Client-side mutations
// =========================================================================

// Submit a review against a completed order_item. The route layer enforces
// the caller is a client; here we re-verify ownership and that the order is
// completed, regardless of what the caller claimed.
export async function submitReview(input: {
  clientId: string;
  productId: string;
  orderItemId: string;
  rating: number;
  text: string;
}): Promise<{ id: string }> {
  const rating = validateRating(input.rating);
  const text = validateReviewText(input.text);

  const result = await db.transaction(async (tx) => {
    const [proof] = await tx
      .select({
        orderItemId: orderItems.id,
        productId: orderItems.productId,
        clientId: orders.clientId,
        fulfillmentStatus: orders.fulfillmentStatus,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, input.orderItemId))
      .limit(1);

    if (!proof) throw new ReviewError("order_item_not_found");
    if (proof.clientId !== input.clientId) throw new ReviewError("forbidden");
    if (proof.productId !== input.productId) {
      throw new ReviewError("product_mismatch");
    }
    if (proof.fulfillmentStatus !== "completed") {
      throw new ReviewError("order_not_completed");
    }

    const [inserted] = await tx
      .insert(productReviews)
      .values({
        productId: input.productId,
        orderItemId: input.orderItemId,
        clientId: input.clientId,
        rating,
        text,
      })
      .returning({ id: productReviews.id });

    return { id: inserted.id };
  });

  notifyManagersOfNewReview(input.clientId, input.productId, result.id).catch(
    (err) => console.error("[reviews] new-review push failed:", err),
  );

  return result;
}

async function notifyManagersOfNewReview(
  clientId: string,
  productId: string,
  reviewId: string,
): Promise<void> {
  const [product] = await db
    .select({ title: products.title })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const productTitle = product?.title ?? "товара";

  const [client] = await db
    .select({ managerId: users.managerId })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);

  let recipientIds: string[] = [];
  if (client?.managerId) {
    recipientIds = [client.managerId];
  } else {
    // Fallback: every active senior_manager + admin. Same fallback shape used
    // when a freshly registered client without a manager link still needs to
    // be visible to staff.
    const fallbacks = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.role, ["senior_manager", "admin"]),
          isNull(users.deactivatedAt),
        ),
      );
    recipientIds = fallbacks.map((r) => r.id);
  }

  for (const recipientId of recipientIds) {
    await sendPushToUser(recipientId, {
      title: "Новый отзыв на модерации",
      body: productTitle,
      data: { type: "review_submitted", reviewId },
    });
  }
}

// Edit a review the caller owns. Always resets status to 'pending' — staff
// re-moderate. Refused on already-deleted reviews.
export async function editReview(input: {
  reviewId: string;
  clientId: string;
  rating: number;
  text: string;
}): Promise<void> {
  const rating = validateRating(input.rating);
  const text = validateReviewText(input.text);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        clientId: productReviews.clientId,
        status: productReviews.status,
      })
      .from(productReviews)
      .where(eq(productReviews.id, input.reviewId))
      .for("update")
      .limit(1);

    if (!row) throw new ReviewError("review_not_found");
    if (row.clientId !== input.clientId) throw new ReviewError("forbidden");
    if (row.status === "deleted") throw new ReviewError("review_deleted");

    const now = new Date();
    await tx
      .update(productReviews)
      .set({
        rating,
        text,
        status: "pending",
        statusChangedAt: now,
        statusChangedByUserId: input.clientId,
        updatedAt: now,
      })
      .where(eq(productReviews.id, input.reviewId));
  });
}

// Soft-delete by client. Idempotent.
export async function deleteReviewByClient(input: {
  reviewId: string;
  clientId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        clientId: productReviews.clientId,
        status: productReviews.status,
      })
      .from(productReviews)
      .where(eq(productReviews.id, input.reviewId))
      .for("update")
      .limit(1);

    if (!row) throw new ReviewError("review_not_found");
    if (row.clientId !== input.clientId) throw new ReviewError("forbidden");
    if (row.status === "deleted") return;

    const now = new Date();
    await tx
      .update(productReviews)
      .set({
        status: "deleted",
        statusChangedAt: now,
        statusChangedByUserId: input.clientId,
        updatedAt: now,
      })
      .where(eq(productReviews.id, input.reviewId));
  });
}

// =========================================================================
// Staff moderation
// =========================================================================

// Manager-role callers may only act on reviews whose client's *current*
// manager_id is them — no snapshot. Senior managers and admins can act on
// any review.
//
// On 'publish': pending → published; published is a no-op; deleted → 409.
// On 'delete': any non-deleted state → deleted; idempotent on already-deleted.
//
// Publish pushes the client; delete is silent per product spec.
export async function moderateReview(input: {
  reviewId: string;
  action: "publish" | "delete";
  actorId: string;
  actorRole: StaffRole;
}): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: productReviews.id,
        status: productReviews.status,
        clientId: productReviews.clientId,
        productId: productReviews.productId,
        clientManagerId: users.managerId,
      })
      .from(productReviews)
      .innerJoin(users, eq(users.id, productReviews.clientId))
      .where(eq(productReviews.id, input.reviewId))
      .for("update")
      .limit(1);

    if (!row) throw new ReviewError("review_not_found");
    if (
      input.actorRole === "manager" &&
      row.clientManagerId !== input.actorId
    ) {
      throw new ReviewError("forbidden");
    }

    if (input.action === "publish") {
      if (row.status === "deleted") throw new ReviewError("review_deleted");
      if (row.status === "published") {
        return { clientId: row.clientId, productId: row.productId, changed: false };
      }
    } else {
      if (row.status === "deleted") {
        return { clientId: row.clientId, productId: row.productId, changed: false };
      }
    }

    const now = new Date();
    await tx
      .update(productReviews)
      .set({
        status: input.action === "publish" ? "published" : "deleted",
        statusChangedAt: now,
        statusChangedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(eq(productReviews.id, input.reviewId));

    return { clientId: row.clientId, productId: row.productId, changed: true };
  });

  if (input.action === "publish" && result.changed) {
    const [product] = await db
      .select({ title: products.title })
      .from(products)
      .where(eq(products.id, result.productId))
      .limit(1);

    sendPushToUser(result.clientId, {
      title: "Ваш отзыв опубликован",
      body: product?.title ?? "товар",
      data: { type: "review_published", reviewId: input.reviewId },
    }).catch((err) => console.error("[reviews] publish push failed:", err));
  }
}

// =========================================================================
// Replies (staff only)
// =========================================================================

// Reply to a *published* review. Pending or deleted reviews can't be replied
// to — replies are public-facing, so they only make sense on a public review.
export async function replyToReview(input: {
  reviewId: string;
  authorId: string;
  authorRole: StaffRole;
  text: string;
}): Promise<{ id: string }> {
  const text = validateReplyText(input.text);

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        status: productReviews.status,
        clientId: productReviews.clientId,
        productId: productReviews.productId,
        clientManagerId: users.managerId,
      })
      .from(productReviews)
      .innerJoin(users, eq(users.id, productReviews.clientId))
      .where(eq(productReviews.id, input.reviewId))
      .limit(1);

    if (!row) throw new ReviewError("review_not_found");
    if (row.status !== "published") {
      throw new ReviewError("review_not_published");
    }
    if (
      input.authorRole === "manager" &&
      row.clientManagerId !== input.authorId
    ) {
      throw new ReviewError("forbidden");
    }

    const [inserted] = await tx
      .insert(productReviewReplies)
      .values({
        reviewId: input.reviewId,
        authorId: input.authorId,
        text,
      })
      .returning({ id: productReviewReplies.id });

    await tx
      .update(productReviews)
      .set({ updatedAt: new Date() })
      .where(eq(productReviews.id, input.reviewId));

    return { id: inserted.id, clientId: row.clientId, productId: row.productId };
  });

  const [product] = await db
    .select({ title: products.title })
    .from(products)
    .where(eq(products.id, result.productId))
    .limit(1);

  sendPushToUser(result.clientId, {
    title: "На ваш отзыв ответили",
    body: product?.title ?? "ваш отзыв",
    data: {
      type: "review_replied",
      reviewId: input.reviewId,
      replyId: result.id,
    },
  }).catch((err) => console.error("[reviews] reply push failed:", err));

  return { id: result.id };
}

// Soft-delete a reply. Manager: only own replies. Senior/admin: any reply.
export async function deleteReply(input: {
  replyId: string;
  requesterId: string;
  requesterRole: StaffRole;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        authorId: productReviewReplies.authorId,
        deletedAt: productReviewReplies.deletedAt,
      })
      .from(productReviewReplies)
      .where(eq(productReviewReplies.id, input.replyId))
      .for("update")
      .limit(1);

    if (!row) throw new ReviewError("reply_not_found");
    if (row.deletedAt) return;
    if (
      input.requesterRole === "manager" &&
      row.authorId !== input.requesterId
    ) {
      throw new ReviewError("forbidden");
    }

    const now = new Date();
    await tx
      .update(productReviewReplies)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(productReviewReplies.id, input.replyId));
  });
}

// =========================================================================
// Reads
// =========================================================================

export type ReplySummary = {
  id: string;
  text: string;
  createdAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
};

export type ReviewListItem = {
  id: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  product: {
    id: string;
    title: string;
  };
  replies: ReplySummary[];
};

async function repliesByReviewId(
  reviewIds: readonly string[],
): Promise<Map<string, ReplySummary[]>> {
  const map = new Map<string, ReplySummary[]>();
  if (reviewIds.length === 0) return map;

  const rows = await db
    .select({
      id: productReviewReplies.id,
      reviewId: productReviewReplies.reviewId,
      text: productReviewReplies.text,
      createdAt: productReviewReplies.createdAt,
      author: {
        id: replyAuthorUsers.id,
        firstName: replyAuthorUsers.firstName,
        lastName: replyAuthorUsers.lastName,
        avatarUrl: replyAuthorUsers.avatarUrl,
      },
    })
    .from(productReviewReplies)
    .innerJoin(
      replyAuthorUsers,
      eq(replyAuthorUsers.id, productReviewReplies.authorId),
    )
    .where(
      and(
        inArray(productReviewReplies.reviewId, reviewIds as string[]),
        isNull(productReviewReplies.deletedAt),
      ),
    )
    .orderBy(asc(productReviewReplies.createdAt));

  for (const r of rows) {
    let arr = map.get(r.reviewId);
    if (!arr) {
      arr = [];
      map.set(r.reviewId, arr);
    }
    arr.push({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      author: r.author,
    });
  }
  return map;
}

// Public feed for a product. Cursor = the createdAt of the last seen review;
// pass null/undefined for the first page. Only published reviews are returned.
export async function listProductReviews(input: {
  productId: string;
  cursor?: Date | null;
  limit: number;
}): Promise<{ reviews: ReviewListItem[]; nextCursor: Date | null }> {
  const limit = Math.min(50, Math.max(1, input.limit));
  const conditions: SQL[] = [
    eq(productReviews.productId, input.productId),
    eq(productReviews.status, "published"),
  ];
  if (input.cursor) {
    conditions.push(lt(productReviews.createdAt, input.cursor));
  }

  const rows = await db
    .select({
      review: productReviews,
      product: { id: products.id, title: products.title },
      client: {
        id: reviewClientUsers.id,
        firstName: reviewClientUsers.firstName,
        lastName: reviewClientUsers.lastName,
        avatarUrl: reviewClientUsers.avatarUrl,
      },
    })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .innerJoin(
      reviewClientUsers,
      eq(reviewClientUsers.id, productReviews.clientId),
    )
    .where(and(...conditions))
    .orderBy(desc(productReviews.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? sliced[sliced.length - 1].review.createdAt
    : null;

  const ids = sliced.map((r) => r.review.id);
  const repliesMap = await repliesByReviewId(ids);

  return {
    reviews: sliced.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      text: r.review.text,
      status: r.review.status,
      createdAt: r.review.createdAt,
      updatedAt: r.review.updatedAt,
      client: r.client,
      product: r.product,
      replies: repliesMap.get(r.review.id) ?? [],
    })),
    nextCursor,
  };
}

// Calling client's own reviews — all statuses except 'deleted'. The flat list
// behind the mobile "Мои отзывы" page.
export async function listMyReviews(input: {
  clientId: string;
}): Promise<ReviewListItem[]> {
  const rows = await db
    .select({
      review: productReviews,
      product: { id: products.id, title: products.title },
      client: {
        id: reviewClientUsers.id,
        firstName: reviewClientUsers.firstName,
        lastName: reviewClientUsers.lastName,
        avatarUrl: reviewClientUsers.avatarUrl,
      },
    })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .innerJoin(
      reviewClientUsers,
      eq(reviewClientUsers.id, productReviews.clientId),
    )
    .where(
      and(
        eq(productReviews.clientId, input.clientId),
        ne(productReviews.status, "deleted"),
      ),
    )
    .orderBy(desc(productReviews.createdAt));

  const ids = rows.map((r) => r.review.id);
  const repliesMap = await repliesByReviewId(ids);

  return rows.map((r) => ({
    id: r.review.id,
    rating: r.review.rating,
    text: r.review.text,
    status: r.review.status,
    createdAt: r.review.createdAt,
    updatedAt: r.review.updatedAt,
    client: r.client,
    product: r.product,
    replies: repliesMap.get(r.review.id) ?? [],
  }));
}

// Staff list. Manager-role rows are scoped via JOIN on users.manager_id of
// the review's client (live, not snapshot — see schema comment). Always
// excludes 'deleted' status; admins who need an audit view get a separate
// route in the future.
export async function listStaffReviews(input: {
  actorId: string;
  actorRole: StaffRole;
  status?: ReviewStatus | null;
  q?: string | null;
  clientId?: string | null;
  page: number;
  pageSize: number;
}): Promise<{
  reviews: ReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(50, Math.max(1, input.pageSize));

  const conditions: SQL[] = [ne(productReviews.status, "deleted")];

  if (input.actorRole === "manager") {
    conditions.push(eq(reviewClientUsers.managerId, input.actorId));
  }
  if (input.status && input.status !== "deleted") {
    conditions.push(eq(productReviews.status, input.status));
  }
  if (input.clientId) {
    conditions.push(eq(productReviews.clientId, input.clientId));
  }
  if (input.q && input.q.trim()) {
    const like = `%${input.q.trim()}%`;
    const built = or(
      ilike(reviewClientUsers.firstName, like),
      ilike(reviewClientUsers.lastName, like),
      ilike(reviewClientUsers.email, like),
      ilike(products.title, like),
    );
    if (built) conditions.push(built);
  }
  const where = and(...conditions);

  const totalRows = await db
    .select({ total: count() })
    .from(productReviews)
    .innerJoin(
      reviewClientUsers,
      eq(reviewClientUsers.id, productReviews.clientId),
    )
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);

  const rows = await db
    .select({
      review: productReviews,
      product: { id: products.id, title: products.title },
      client: {
        id: reviewClientUsers.id,
        firstName: reviewClientUsers.firstName,
        lastName: reviewClientUsers.lastName,
        avatarUrl: reviewClientUsers.avatarUrl,
      },
    })
    .from(productReviews)
    .innerJoin(
      reviewClientUsers,
      eq(reviewClientUsers.id, productReviews.clientId),
    )
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(where)
    .orderBy(desc(productReviews.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.review.id);
  const repliesMap = await repliesByReviewId(ids);

  return {
    reviews: rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      text: r.review.text,
      status: r.review.status,
      createdAt: r.review.createdAt,
      updatedAt: r.review.updatedAt,
      client: r.client,
      product: r.product,
      replies: repliesMap.get(r.review.id) ?? [],
    })),
    total,
    page,
    pageSize,
  };
}

// Drives the staff bottom-nav badge ("Отзывы" tab). Same scoping as the list.
export async function pendingReviewsCount(input: {
  actorId: string;
  actorRole: StaffRole;
}): Promise<number> {
  const conditions: SQL[] = [eq(productReviews.status, "pending")];
  if (input.actorRole === "manager") {
    conditions.push(eq(reviewClientUsers.managerId, input.actorId));
  }
  const where = and(...conditions);

  const rows = await db
    .select({ total: count() })
    .from(productReviews)
    .innerJoin(
      reviewClientUsers,
      eq(reviewClientUsers.id, productReviews.clientId),
    )
    .where(where);
  return Number(rows[0]?.total ?? 0);
}
