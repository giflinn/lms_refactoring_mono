// Authoritative access check for an LMS course. The user has access iff they
// own at least one fulfilment_status='active' + payment_status='paid'
// order_item linked (via product.lms_course_id) to the course. Mirrors the
// rule used elsewhere (Telegram-grant access) — we don't materialise a
// separate enrollment record; order state is the source of truth.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, products } from "../db/schema";

export async function userOwnsCourse(
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
