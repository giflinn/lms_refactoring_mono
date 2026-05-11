import { Router, type Response } from "express";
import { and, count, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireStaffAdmin } from "../middleware/requireRole";
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
import { buildCsv, type CsvCell } from "../services/csv";

export const reportsRouter = Router();

const STAFF_ROLES = ["manager", "senior_manager", "admin"] as const;

function toNumber(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function growthPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Pagination params with sane defaults + clamping. pageSize over 100 is
// almost always a mistake (UI table renders ~10 rows), but we accept up to
// 100 for the CSV export path which doesn't paginate.
function parsePaging(req: { query: Record<string, unknown> }): {
  page: number;
  pageSize: number;
} {
  const pageRaw = Number(req.query.page ?? 1);
  const sizeRaw = Number(req.query.pageSize ?? 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= 100
      ? Math.floor(sizeRaw)
      : 10;
  return { page, pageSize };
}

// =====================================================================
// /reports/managers — staff table with aggregated sales/refunds
// =====================================================================

type ManagerSortBy = "name" | "clients" | "sales" | "refunds";

function parseManagerSort(raw: unknown): {
  by: ManagerSortBy;
  dir: "asc" | "desc";
} {
  const byRaw = typeof raw === "string" ? raw : "sales:desc";
  const [byStr, dirStr] = byRaw.split(":");
  const by: ManagerSortBy = (
    ["name", "clients", "sales", "refunds"] as const
  ).includes(byStr as ManagerSortBy)
    ? (byStr as ManagerSortBy)
    : "sales";
  const dir: "asc" | "desc" = dirStr === "asc" ? "asc" : "desc";
  return { by, dir };
}

// Single shape used by both the table endpoint and the CSV export. Keeping
// the SQL in one place means both views stay in lockstep on what "sales" /
// "refunds" mean.
async function fetchManagersRows(opts: {
  from: Date;
  to: Date;
  q: string | null;
  sortBy: ManagerSortBy;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const { from, to, q, sortBy, sortDir, page, pageSize } = opts;
  const toExclusive = addDays(to, 1);

  // Predicate filters: role + active + optional search across the four
  // user-facing columns.
  const searchClause = q
    ? or(
        ilike(users.firstName, `%${q}%`),
        ilike(users.lastName, `%${q}%`),
        ilike(users.email, `%${q}%`),
        ilike(users.phone, `%${q}%`),
      )
    : undefined;

  const baseWhere = and(
    inArray(users.role, [...STAFF_ROLES]),
    sql`${users.deactivatedAt} IS NULL`,
    searchClause,
  );

  const orderBySql = (() => {
    if (sortBy === "name")
      return sql`LOWER(${users.firstName} || ' ' || ${users.lastName}) ${sql.raw(sortDir)}`;
    if (sortBy === "clients") return sql`clients_count ${sql.raw(sortDir)}`;
    if (sortBy === "sales") return sql`sales_tenge ${sql.raw(sortDir)}`;
    return sql`refunds_tenge ${sql.raw(sortDir)}`;
  })();

  // Correlated subqueries for the three aggregates. Staff table is small (≤
  // tens of rows in practice) — avoiding GROUP BY keeps the query readable
  // without a meaningful perf hit.
  //
  // Note: the outer-scope reference is written as the literal `users.id`
  // (not `${users.id}`). Drizzle's column interpolation emits a bare `"id"`,
  // which inside the subquery's `FROM users c` / `FROM orders o` resolves to
  // the *inner* table's id — silently zeroing every aggregate. Past incident.
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      role: users.role,
      clientsCount: sql<number>`(
        SELECT COUNT(*)::int FROM users c
        WHERE c.manager_id = users.id AND c.role = 'client'
      ) AS clients_count`,
      salesTenge: sql<string>`COALESCE((
        SELECT SUM(o.total_tenge) FROM orders o
        WHERE o.manager_id = users.id
          AND o.payment_status = 'paid'
          AND o.first_paid_at IS NOT NULL
          AND o.first_paid_at >= ${from}
          AND o.first_paid_at < ${toExclusive}
      ), 0) AS sales_tenge`,
      refundsTenge: sql<string>`COALESCE((
        SELECT SUM(o.total_tenge) FROM orders o
        WHERE o.manager_id = users.id
          AND o.payment_status = 'refunded'
          AND o.first_paid_at IS NOT NULL
          AND o.first_paid_at >= ${from}
          AND o.first_paid_at < ${toExclusive}
      ), 0) AS refunds_tenge`,
    })
    .from(users)
    .where(baseWhere)
    .orderBy(orderBySql)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db
    .select({ c: count() })
    .from(users)
    .where(baseWhere);

  return {
    items: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      avatarUrl: r.avatarUrl,
      role: r.role,
      clientsCount: r.clientsCount,
      salesTenge: toNumber(r.salesTenge),
      refundsTenge: toNumber(r.refundsTenge),
    })),
    total: totalRow.c,
  };
}

reportsRouter.get(
  "/reports/managers",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const { by, dir } = parseManagerSort(req.query.sort);
      const q =
        typeof req.query.q === "string" && req.query.q.trim()
          ? req.query.q.trim()
          : null;
      const { page, pageSize } = parsePaging(req);
      const result = await fetchManagersRows({
        from,
        to,
        q,
        sortBy: by,
        sortDir: dir,
        page,
        pageSize,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  "/reports/managers.csv",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const { by, dir } = parseManagerSort(req.query.sort);
      const q =
        typeof req.query.q === "string" && req.query.q.trim()
          ? req.query.q.trim()
          : null;
      const { items } = await fetchManagersRows({
        from,
        to,
        q,
        sortBy: by,
        sortDir: dir,
        page: 1,
        pageSize: 10000,
      });
      const csv = buildCsv(
        ["Менеджер", "Email", "Телефон", "Кол. клиентов", "Сумма покупок (₸)", "Сумма возвратов (₸)"],
        items.map<CsvCell[]>((m) => [
          `${m.firstName} ${m.lastName}`.trim(),
          m.email,
          m.phone,
          m.clientsCount,
          m.salesTenge,
          m.refundsTenge,
        ]),
      );
      sendCsv(res, csv, `managers-${isoFile(from)}-${isoFile(to)}.csv`);
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// /reports/sales — product table with paid/refund aggregates
// =====================================================================

type SalesSortBy =
  | "title"
  | "category"
  | "salesCount"
  | "salesTenge"
  | "refundsCount"
  | "refundsTenge";

function parseSalesSort(raw: unknown): {
  by: SalesSortBy;
  dir: "asc" | "desc";
} {
  const byRaw = typeof raw === "string" ? raw : "salesTenge:desc";
  const [byStr, dirStr] = byRaw.split(":");
  const valid: SalesSortBy[] = [
    "title",
    "category",
    "salesCount",
    "salesTenge",
    "refundsCount",
    "refundsTenge",
  ];
  const by: SalesSortBy = (valid as string[]).includes(byStr)
    ? (byStr as SalesSortBy)
    : "salesTenge";
  const dir: "asc" | "desc" = dirStr === "asc" ? "asc" : "desc";
  return { by, dir };
}

async function fetchSalesRows(opts: {
  from: Date;
  to: Date;
  sortBy: SalesSortBy;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const { from, to, sortBy, sortDir, page, pageSize } = opts;
  const toExclusive = addDays(to, 1);

  // CASE-based aggregate so paid + refunded show up in the same row per
  // product. first_paid_at is the bucket: a refunded order still counts in
  // the period it was originally paid.
  const orderBySql = (() => {
    if (sortBy === "title")
      return sql`LOWER(${orderItems.productTitle}) ${sql.raw(sortDir)}`;
    if (sortBy === "category")
      return sql`LOWER(${orderItems.productCategoryName}) ${sql.raw(sortDir)}`;
    if (sortBy === "salesCount") return sql`sales_count ${sql.raw(sortDir)}`;
    if (sortBy === "salesTenge") return sql`sales_tenge ${sql.raw(sortDir)}`;
    if (sortBy === "refundsCount") return sql`refunds_count ${sql.raw(sortDir)}`;
    return sql`refunds_tenge ${sql.raw(sortDir)}`;
  })();

  const rows = await db
    .select({
      productId: orderItems.productId,
      productTitle: orderItems.productTitle,
      categoryName: orderItems.productCategoryName,
      salesCount: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'paid' THEN ${orderItems.quantity} ELSE 0 END), 0)::int AS sales_count`,
      salesTenge: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'paid' THEN ${orderItems.quantity} * ${orderItems.unitPriceTenge} ELSE 0 END), 0) AS sales_tenge`,
      refundsCount: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'refunded' THEN ${orderItems.quantity} ELSE 0 END), 0)::int AS refunds_count`,
      refundsTenge: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'refunded' THEN ${orderItems.quantity} * ${orderItems.unitPriceTenge} ELSE 0 END), 0) AS refunds_tenge`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        sql`${orders.firstPaidAt} IS NOT NULL`,
        gte(orders.firstPaidAt, from),
        lt(orders.firstPaidAt, toExclusive),
        inArray(orders.paymentStatus, ["paid", "refunded"]),
      ),
    )
    .groupBy(
      orderItems.productId,
      orderItems.productTitle,
      orderItems.productCategoryName,
    )
    .orderBy(orderBySql)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Total = number of distinct products that had any paid/refunded movement
  // in the window.
  const [totalRow] = await db
    .select({
      c: sql<number>`COUNT(DISTINCT ${orderItems.productId})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        sql`${orders.firstPaidAt} IS NOT NULL`,
        gte(orders.firstPaidAt, from),
        lt(orders.firstPaidAt, toExclusive),
        inArray(orders.paymentStatus, ["paid", "refunded"]),
      ),
    );

  return {
    items: rows.map((r) => ({
      productId: r.productId,
      productTitle: r.productTitle,
      categoryName: r.categoryName,
      salesCount: r.salesCount,
      salesTenge: toNumber(r.salesTenge),
      refundsCount: r.refundsCount,
      refundsTenge: toNumber(r.refundsTenge),
    })),
    total: totalRow.c,
  };
}

reportsRouter.get(
  "/reports/sales",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const { by, dir } = parseSalesSort(req.query.sort);
      const { page, pageSize } = parsePaging(req);
      const result = await fetchSalesRows({
        from,
        to,
        sortBy: by,
        sortDir: dir,
        page,
        pageSize,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  "/reports/sales.csv",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const { by, dir } = parseSalesSort(req.query.sort);
      const { items } = await fetchSalesRows({
        from,
        to,
        sortBy: by,
        sortDir: dir,
        page: 1,
        pageSize: 10000,
      });
      const csv = buildCsv(
        [
          "Товар",
          "Категория",
          "Кол. продаж",
          "Сумма продаж (₸)",
          "Кол. возвратов",
          "Сумма возвратов (₸)",
        ],
        items.map<CsvCell[]>((p) => [
          p.productTitle,
          p.categoryName,
          p.salesCount,
          p.salesTenge,
          p.refundsCount,
          p.refundsTenge,
        ]),
      );
      sendCsv(res, csv, `sales-${isoFile(from)}-${isoFile(to)}.csv`);
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// /reports/new-clients/{summary,chart}
// =====================================================================

reportsRouter.get(
  "/reports/new-clients/summary",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const now = new Date();
      const thisMonth = startOfMonthUTC(now);
      const prevMonth = addMonths(thisMonth, -1);
      const prevPrev = addMonths(thisMonth, -2);

      const [thisRow] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(eq(users.role, "client"), gte(users.createdAt, thisMonth)),
        );
      const [prevRow] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, prevMonth),
            lt(users.createdAt, thisMonth),
          ),
        );
      const [prevPrevRow] = await db
        .select({ c: count() })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, prevPrev),
            lt(users.createdAt, prevMonth),
          ),
        );
      const [totalRow] = await db
        .select({ c: count() })
        .from(users)
        .where(eq(users.role, "client"));

      res.json({
        thisMonth: {
          value: thisRow.c,
          growthPct: growthPct(thisRow.c, prevRow.c),
        },
        prevMonth: {
          value: prevRow.c,
          growthPct: growthPct(prevRow.c, prevPrevRow.c),
        },
        total: totalRow.c,
      });
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  "/reports/new-clients/chart",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const bucket = pickBucket(from.getTime(), to.getTime());
      const starts = bucketStarts(from, to, bucket);

      const rows = await db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, from),
            lt(users.createdAt, addDays(to, 1)),
          ),
        );

      const buckets = starts.map((start) => ({
        start,
        end: bucketEnd(start, bucket),
        count: 0,
      }));
      for (const row of rows) {
        const t = (row.createdAt as Date).getTime();
        for (const b of buckets) {
          if (t >= b.start.getTime() && t < b.end.getTime()) {
            b.count += 1;
            break;
          }
        }
      }
      res.json({
        bucket,
        points: buckets.map((b) => ({
          start: b.start.toISOString(),
          label: formatBucketLabel(b.start, bucket),
          count: b.count,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// /reports/managers/:id — drawer summary + chart
// /reports/managers/:id/clients — drawer's paginated client table
// /reports/managers/:id.csv — drawer export
// =====================================================================

async function fetchManagerSummaryAndChart(opts: {
  managerId: string;
  from: Date;
  to: Date;
}) {
  const { managerId, from, to } = opts;
  const toExclusive = addDays(to, 1);

  // 1. Identity row — also serves as a 404 check.
  const [m] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      role: users.role,
      deactivatedAt: users.deactivatedAt,
    })
    .from(users)
    .where(
      and(eq(users.id, managerId), inArray(users.role, [...STAFF_ROLES])),
    )
    .limit(1);
  if (!m || m.deactivatedAt) return null;

  // 2. Live clients count (not range-bound).
  const [clientsRow] = await db
    .select({ c: count() })
    .from(users)
    .where(and(eq(users.managerId, managerId), eq(users.role, "client")));

  // 3. Sales + refunds in range.
  const [salesAgg] = await db
    .select({
      salesCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'paid')::int`,
      salesTenge: sql<string>`COALESCE(SUM(${orders.totalTenge}) FILTER (WHERE ${orders.paymentStatus} = 'paid'), 0)`,
      refundsCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'refunded')::int`,
      refundsTenge: sql<string>`COALESCE(SUM(${orders.totalTenge}) FILTER (WHERE ${orders.paymentStatus} = 'refunded'), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.managerId, managerId),
        sql`${orders.firstPaidAt} IS NOT NULL`,
        gte(orders.firstPaidAt, from),
        lt(orders.firstPaidAt, toExclusive),
        inArray(orders.paymentStatus, ["paid", "refunded"]),
      ),
    );

  // 4. Sales chart (paid only, JS-side bucketing — same shape as dashboard).
  const bucket = pickBucket(from.getTime(), to.getTime());
  const starts = bucketStarts(from, to, bucket);
  const chartRows = await db
    .select({
      firstPaidAt: orders.firstPaidAt,
      total: orders.totalTenge,
    })
    .from(orders)
    .where(
      and(
        eq(orders.managerId, managerId),
        eq(orders.paymentStatus, "paid"),
        sql`${orders.firstPaidAt} IS NOT NULL`,
        gte(orders.firstPaidAt, from),
        lt(orders.firstPaidAt, toExclusive),
      ),
    );
  const chartBuckets = starts.map((start) => ({
    start,
    end: bucketEnd(start, bucket),
    income: 0,
  }));
  for (const row of chartRows) {
    const t = (row.firstPaidAt as Date).getTime();
    for (const b of chartBuckets) {
      if (t >= b.start.getTime() && t < b.end.getTime()) {
        b.income += toNumber(row.total as string | null);
        break;
      }
    }
  }

  return {
    manager: {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      avatarUrl: m.avatarUrl,
      role: m.role,
    },
    summary: {
      totalClients: clientsRow.c,
      totalSales: {
        count: salesAgg.salesCount,
        totalTenge: toNumber(salesAgg.salesTenge),
      },
      totalRefunds: {
        count: salesAgg.refundsCount,
        totalTenge: toNumber(salesAgg.refundsTenge),
      },
    },
    chart: {
      bucket,
      points: chartBuckets.map((b) => ({
        start: b.start.toISOString(),
        label: formatBucketLabel(b.start, bucket),
        incomeTenge: b.income,
      })),
    },
  };
}

// Regex constraint stops `:id` from gobbling the `.csv` suffix on the
// /reports/managers/:id.csv export route — both patterns would otherwise
// match `<uuid>.csv` and Express picks first-registered. UUIDs are
// hex-with-dashes, so `[0-9a-fA-F-]+` is sufficient and rejects literal
// dots.
reportsRouter.get(
  "/reports/managers/:id([0-9a-fA-F-]+)",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const result = await fetchManagerSummaryAndChart({
        managerId: req.params.id,
        from,
        to,
      });
      if (!result) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

async function fetchManagerClients(opts: {
  managerId: string;
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
}) {
  const { managerId, from, to, page, pageSize } = opts;
  const toExclusive = addDays(to, 1);

  const baseWhere = and(
    eq(users.managerId, managerId),
    eq(users.role, "client"),
  );

  // 1. Page of client identity rows. Sort newest-first since the manager's
  // book naturally flows that way; per-row aggregates are merged on top.
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(baseWhere)
    .orderBy(sql`${users.createdAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db
    .select({ c: count() })
    .from(users)
    .where(baseWhere);

  // 2. Aggregates for the visible page only — keeps the query small even
  // when the manager has thousands of clients. Empty IN () would be a SQL
  // error, so short-circuit when no clients on this page.
  const ids = rows.map((r) => r.id);
  type Agg = {
    productsCount: number;
    purchasesTenge: number;
    refundsCount: number;
    refundsTenge: number;
  };
  const aggByClient = new Map<string, Agg>();
  if (ids.length > 0) {
    // Sum (totalTenge) at order grain — straight per-row, no subqueries.
    const orderRows = await db
      .select({
        clientId: orders.clientId,
        paymentStatus: orders.paymentStatus,
        totalTenge: orders.totalTenge,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.clientId, ids),
          sql`${orders.firstPaidAt} IS NOT NULL`,
          gte(orders.firstPaidAt, from),
          lt(orders.firstPaidAt, toExclusive),
          inArray(orders.paymentStatus, ["paid", "refunded"]),
        ),
      );
    for (const row of orderRows) {
      const a = aggByClient.get(row.clientId) ?? {
        productsCount: 0,
        purchasesTenge: 0,
        refundsCount: 0,
        refundsTenge: 0,
      };
      const tenge = toNumber(row.totalTenge as string | null);
      if (row.paymentStatus === "paid") a.purchasesTenge += tenge;
      else a.refundsTenge += tenge;
      aggByClient.set(row.clientId, a);
    }

    // Sum (quantity) at item grain via JOIN. Two queries instead of one
    // correlated subquery — clearer and reliably picks up multi-item orders.
    const itemRows = await db
      .select({
        clientId: orders.clientId,
        paymentStatus: orders.paymentStatus,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          inArray(orders.clientId, ids),
          sql`${orders.firstPaidAt} IS NOT NULL`,
          gte(orders.firstPaidAt, from),
          lt(orders.firstPaidAt, toExclusive),
          inArray(orders.paymentStatus, ["paid", "refunded"]),
        ),
      );
    for (const row of itemRows) {
      const a = aggByClient.get(row.clientId) ?? {
        productsCount: 0,
        purchasesTenge: 0,
        refundsCount: 0,
        refundsTenge: 0,
      };
      const qty = Number(row.quantity) || 0;
      if (row.paymentStatus === "paid") a.productsCount += qty;
      else a.refundsCount += qty;
      aggByClient.set(row.clientId, a);
    }
  }

  return {
    items: rows.map((r) => {
      const a = aggByClient.get(r.id) ?? {
        productsCount: 0,
        purchasesTenge: 0,
        refundsCount: 0,
        refundsTenge: 0,
      };
      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        avatarUrl: r.avatarUrl,
        productsCount: a.productsCount,
        purchasesTenge: a.purchasesTenge,
        refundsCount: a.refundsCount,
        refundsTenge: a.refundsTenge,
      };
    }),
    total: totalRow.c,
  };
}

reportsRouter.get(
  "/reports/managers/:id([0-9a-fA-F-]+)/clients",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const { page, pageSize } = parsePaging(req);
      const result = await fetchManagerClients({
        managerId: req.params.id,
        from,
        to,
        page,
        pageSize,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  "/reports/managers/:id.csv",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const { from, to } = parseRange(req.query.from, req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: "invalid_range" });
        return;
      }
      const detail = await fetchManagerSummaryAndChart({
        managerId: req.params.id,
        from,
        to,
      });
      if (!detail) {
        res.status(404).json({ error: "manager_not_found" });
        return;
      }
      const { items } = await fetchManagerClients({
        managerId: req.params.id,
        from,
        to,
        page: 1,
        pageSize: 10000,
      });
      const csv = buildCsv(
        [
          "Клиент",
          "Email",
          "Кол. продуктов",
          "Сумма покупок (₸)",
          "Кол. возвратов",
          "Сумма возвратов (₸)",
        ],
        items.map<CsvCell[]>((c) => [
          `${c.firstName} ${c.lastName}`.trim(),
          c.email,
          c.productsCount,
          c.purchasesTenge,
          c.refundsCount,
          c.refundsTenge,
        ]),
      );
      const filenameStem = `${detail.manager.lastName || detail.manager.email}-${isoFile(from)}-${isoFile(to)}`;
      sendCsv(res, csv, `manager-${filenameStem}.csv`);
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// helpers
// =====================================================================

function isoFile(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sendCsv(res: Response, body: string, filename: string) {
  // RFC 5987 filename* would be nicer for non-ASCII filenames, but we only
  // emit ASCII filename stems (lastName fields can be Cyrillic — sanitize).
  const safe = filename.replace(/[^\w.\-]/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  res.send(body);
}
