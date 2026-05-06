import { Router } from "express";
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, products, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaff } from "../middleware/requireRole";
import {
  addDays,
  addMonths,
  bucketEnd,
  bucketStarts,
  formatBucketLabel,
  parseRange,
  pickBucket,
  startOfMonthUTC,
} from "../services/dateBuckets";

export const dashboardRouter = Router();

function toNumber(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// null when previous period is zero — UI renders a neutral "—" for that case.
function growthPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// 4 cards: total clients, paid orders, paid income, active staff. Each ships
// a month-over-month delta computed against the current vs previous calendar
// month (UTC boundaries — same TZ the rest of the app stores timestamps in).
dashboardRouter.get(
  "/dashboard/summary",
  requireAuth,
  requireStaff,
  async (_req, res, next) => {
    try {
      const now = new Date();
      const thisMonthStart = startOfMonthUTC(now);
      const prevMonthStart = addMonths(thisMonthStart, -1);

      const [clientsRow] = await db
        .select({ c: count() })
        .from(users)
        .where(eq(users.role, "client"));

      const [paidOrdersRow] = await db
        .select({
          c: count(),
          income: sum(orders.totalTenge),
        })
        .from(orders)
        .where(eq(orders.paymentStatus, "paid"));

      const [managersRow] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            inArray(users.role, ["manager", "senior_manager", "admin"]),
            sql`${users.deactivatedAt} IS NULL`,
          ),
        );

      const [clientsThisMonth] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, thisMonthStart),
          ),
        );
      const [clientsPrevMonth] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, prevMonthStart),
            lt(users.createdAt, thisMonthStart),
          ),
        );

      const [salesThisMonth] = await db
        .select({
          c: count(),
          income: sum(orders.totalTenge),
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "paid"),
            sql`${orders.firstPaidAt} IS NOT NULL`,
            gte(orders.firstPaidAt, thisMonthStart),
          ),
        );
      const [salesPrevMonth] = await db
        .select({
          c: count(),
          income: sum(orders.totalTenge),
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "paid"),
            sql`${orders.firstPaidAt} IS NOT NULL`,
            gte(orders.firstPaidAt, prevMonthStart),
            lt(orders.firstPaidAt, thisMonthStart),
          ),
        );

      const [managersThisMonth] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            inArray(users.role, ["manager", "senior_manager", "admin"]),
            sql`${users.deactivatedAt} IS NULL`,
            gte(users.createdAt, thisMonthStart),
          ),
        );
      const [managersPrevMonth] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            inArray(users.role, ["manager", "senior_manager", "admin"]),
            sql`${users.deactivatedAt} IS NULL`,
            gte(users.createdAt, prevMonthStart),
            lt(users.createdAt, thisMonthStart),
          ),
        );

      res.json({
        totalClients: {
          value: clientsRow.c,
          growthPct: growthPct(clientsThisMonth.c, clientsPrevMonth.c),
        },
        totalSales: {
          value: paidOrdersRow.c,
          growthPct: growthPct(salesThisMonth.c, salesPrevMonth.c),
        },
        totalIncome: {
          valueTenge: toNumber(paidOrdersRow.income as string | null),
          growthPct: growthPct(
            toNumber(salesThisMonth.income as string | null),
            toNumber(salesPrevMonth.income as string | null),
          ),
        },
        totalManagers: {
          value: managersRow.c,
          growthPct: growthPct(managersThisMonth.c, managersPrevMonth.c),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

dashboardRouter.get(
  "/dashboard/sales-chart",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const bucket = pickBucket(from.getTime(), to.getTime());
      const starts = bucketStarts(from, to, bucket);

      // Bucket in JS, not SQL. Dataset is admin-side and small; date_trunc
      // doesn't speak ISO weeks cleanly, and the JS path keeps the three
      // bucket modes uniform.
      const rows = await db
        .select({
          firstPaidAt: orders.firstPaidAt,
          total: orders.totalTenge,
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "paid"),
            sql`${orders.firstPaidAt} IS NOT NULL`,
            gte(orders.firstPaidAt, from),
            lt(orders.firstPaidAt, addDays(to, 1)),
          ),
        );

      const buckets = starts.map((start) => ({
        start,
        end: bucketEnd(start, bucket),
        income: 0,
      }));

      for (const row of rows) {
        const at = row.firstPaidAt as Date | null;
        if (!at) continue;
        const t = at.getTime();
        for (const b of buckets) {
          if (t >= b.start.getTime() && t < b.end.getTime()) {
            b.income += toNumber(row.total as string | null);
            break;
          }
        }
      }

      res.json({
        bucket,
        points: buckets.map((b) => ({
          start: b.start.toISOString(),
          label: formatBucketLabel(b.start, bucket),
          incomeTenge: b.income,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// Top N products by units sold within the range. "Sold" = order_item on a
// paid order whose first_paid_at falls in the window. Income sums
// (unit_price_tenge × quantity) so historical price changes stay accurate.
// "Цена" returns the *current* products.price (not the snapshot) per spec —
// the column shows what the product costs today.
dashboardRouter.get(
  "/dashboard/top-products",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const limitParam = Number(req.query.limit ?? 10);
      const limit =
        Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100
          ? Math.floor(limitParam)
          : 10;

      const rows = await db
        .select({
          productId: orderItems.productId,
          productTitle: orderItems.productTitle,
          quantity: sql<number>`SUM(${orderItems.quantity})::int`,
          income: sql<string>`COALESCE(SUM(${orderItems.unitPriceTenge} * ${orderItems.quantity}), 0)::numeric`,
          currentPrice: products.price,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(
          and(
            eq(orders.paymentStatus, "paid"),
            sql`${orders.firstPaidAt} IS NOT NULL`,
            gte(orders.firstPaidAt, from),
            lt(orders.firstPaidAt, addDays(to, 1)),
          ),
        )
        .groupBy(orderItems.productId, orderItems.productTitle, products.price)
        .orderBy(desc(sql`SUM(${orderItems.quantity})`))
        .limit(limit);

      res.json({
        items: rows.map((r) => ({
          productId: r.productId,
          productTitle: r.productTitle,
          quantity: r.quantity,
          incomeTenge: toNumber(r.income),
          currentPriceTenge:
            r.currentPrice == null ? null : toNumber(r.currentPrice),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

