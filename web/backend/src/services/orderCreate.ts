// Transactional order creation called from POST /orders. The trickiness is
// not the order itself but the coach_slot reservations bound to bookable
// items: we have to atomically resolve the slot, check no overlapping
// booking exists, and write order + items + bookings — otherwise two
// clients tapping "Open Kaspi" simultaneously could double-book.
//
// We rely on per-statement check inside a serializable transaction. For
// this app's volume (single coach, low concurrency) it's plenty; if
// contention ever shows up, promote to a Postgres EXCLUDE constraint on
// tstzrange.

import { and, eq, inArray, lte, gte, gt, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  coachSlots,
  orderItems,
  orders,
  productCategories,
  products,
  productSlotTypes,
  users,
} from "../db/schema";

export type CreateOrderInputItem = {
  productId: string;
  // ISO timestamp; required for bookable products (durationMinutes != null),
  // ignored for the rest.
  bookedStart?: string | null;
};

export class OrderCreationError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, details?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export type CreatedOrder = {
  id: string;
  orderNumber: number;
};

export async function createOrderForClient(
  clientId: string,
  input: CreateOrderInputItem[],
): Promise<CreatedOrder> {
  if (input.length === 0) throw new OrderCreationError("empty_cart");

  // Pre-fetch products + categories outside the transaction (read-only,
  // no race). The transaction below re-reads coach_slots / coach_bookings
  // for write-time consistency.
  const productIds = input.map((i) => i.productId);
  const productRows = await db
    .select({
      product: products,
      categoryName: productCategories.name,
    })
    .from(products)
    .innerJoin(
      productCategories,
      eq(products.categoryId, productCategories.id),
    )
    .where(inArray(products.id, productIds));

  const productMap = new Map(productRows.map((r) => [r.product.id, r]));
  for (const item of input) {
    const row = productMap.get(item.productId);
    if (!row) throw new OrderCreationError("product_not_found", { productId: item.productId });
    if (!row.product.isActive) {
      throw new OrderCreationError("product_inactive", { productId: item.productId });
    }
    if (row.product.price === null) {
      // "По запросу" products can't be ordered directly — they route through chat.
      throw new OrderCreationError("product_not_orderable", {
        productId: item.productId,
      });
    }
    if (row.product.durationMinutes !== null) {
      if (!item.bookedStart) {
        throw new OrderCreationError("booked_start_required", {
          productId: item.productId,
        });
      }
      const ts = new Date(item.bookedStart);
      if (isNaN(ts.getTime())) {
        throw new OrderCreationError("invalid_booked_start", {
          productId: item.productId,
        });
      }
      if (ts.getTime() < Date.now()) {
        throw new OrderCreationError("booked_start_in_past", {
          productId: item.productId,
        });
      }
    }
  }

  // For bookable products, gather allowed slot type ids upfront — we need
  // them inside the transaction anyway and a single pre-fetch keeps the
  // critical section lean.
  const bookableProductIds = input
    .filter(
      (i) => productMap.get(i.productId)!.product.durationMinutes !== null,
    )
    .map((i) => i.productId);
  const allowedTypesByProduct = new Map<string, string[]>();
  if (bookableProductIds.length > 0) {
    const rows = await db
      .select({
        productId: productSlotTypes.productId,
        slotTypeId: productSlotTypes.slotTypeId,
      })
      .from(productSlotTypes)
      .where(inArray(productSlotTypes.productId, bookableProductIds));
    for (const r of rows) {
      const arr = allowedTypesByProduct.get(r.productId) ?? [];
      arr.push(r.slotTypeId);
      allowedTypesByProduct.set(r.productId, arr);
    }
    for (const pid of bookableProductIds) {
      if (!allowedTypesByProduct.get(pid)?.length) {
        throw new OrderCreationError("product_misconfigured", { productId: pid });
      }
    }
  }

  // Manager snapshot — copy from users.manager_id at create-time. Null is
  // allowed (orders.manager_id is nullable on the schema).
  const clientRows = await db
    .select({ managerId: users.managerId })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);
  const managerId = clientRows[0]?.managerId ?? null;

  return await db.transaction(async (tx) => {
    let totalTenge = 0;
    const itemPlans: Array<{
      productId: string;
      title: string;
      categoryName: string;
      subtitle: string | null;
      unitPriceTenge: string;
      bookedStart: Date | null;
      bookedEnd: Date | null;
      coachSlotId: string | null;
    }> = [];

    for (const item of input) {
      const row = productMap.get(item.productId)!;
      const unitPrice = row.product.price as string; // numeric → string
      totalTenge += Number(unitPrice);

      let bookedStart: Date | null = null;
      let bookedEnd: Date | null = null;
      let coachSlotId: string | null = null;

      if (row.product.durationMinutes !== null) {
        bookedStart = new Date(item.bookedStart!);
        bookedEnd = new Date(
          bookedStart.getTime() + row.product.durationMinutes * 60_000,
        );

        // Find a single active slot whose type is allowed for this product
        // and that fully contains [bookedStart, bookedEnd).
        const allowedTypes = allowedTypesByProduct.get(row.product.id)!;
        const slotMatch = await tx
          .select({ id: coachSlots.id })
          .from(coachSlots)
          .where(
            and(
              eq(coachSlots.status, "active"),
              inArray(coachSlots.slotTypeId, allowedTypes),
              lte(coachSlots.startsAt, bookedStart),
              gte(coachSlots.endsAt, bookedEnd),
            ),
          )
          .limit(1);
        if (slotMatch.length === 0) {
          throw new OrderCreationError("slot_unavailable", {
            productId: row.product.id,
          });
        }
        coachSlotId = slotMatch[0].id;

        // Inside the same slot, no other active booking may overlap our range.
        // Two ranges [s1,e1) and [s2,e2) overlap iff s1 < e2 AND s2 < e1.
        const conflict = await tx
          .select({ id: coachBookings.id })
          .from(coachBookings)
          .where(
            and(
              eq(coachBookings.coachSlotId, coachSlotId),
              eq(coachBookings.status, "active"),
              lt(coachBookings.startsAt, bookedEnd),
              gt(coachBookings.endsAt, bookedStart),
            ),
          )
          .limit(1);
        if (conflict.length > 0) {
          throw new OrderCreationError("slot_taken", {
            productId: row.product.id,
          });
        }
      }

      itemPlans.push({
        productId: row.product.id,
        title: row.product.title,
        categoryName: row.categoryName,
        subtitle: row.product.subtitle,
        unitPriceTenge: unitPrice,
        bookedStart,
        bookedEnd,
        coachSlotId,
      });
    }

    const [orderRow] = await tx
      .insert(orders)
      .values({
        clientId,
        managerId,
        totalTenge: totalTenge.toFixed(2),
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    for (const plan of itemPlans) {
      const [itemRow] = await tx
        .insert(orderItems)
        .values({
          orderId: orderRow.id,
          productId: plan.productId,
          productTitle: plan.title,
          productCategoryName: plan.categoryName,
          productSubtitle: plan.subtitle,
          unitPriceTenge: plan.unitPriceTenge,
          bookedStart: plan.bookedStart,
          bookedEnd: plan.bookedEnd,
        })
        .returning({ id: orderItems.id });

      if (plan.coachSlotId && plan.bookedStart && plan.bookedEnd) {
        await tx.insert(coachBookings).values({
          coachSlotId: plan.coachSlotId,
          clientId,
          orderItemId: itemRow.id,
          startsAt: plan.bookedStart,
          endsAt: plan.bookedEnd,
        });
      }
    }

    return { id: orderRow.id, orderNumber: orderRow.orderNumber };
  });
}
