import { Router } from "express";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import {
  coachBookings,
  orderItems,
  orders,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaff } from "../middleware/requireRole";
import {
  CreateOrderInputItem,
  OrderCreationError,
  createOrderForClient,
} from "../services/orderCreate";
import {
  OrderStatus,
  OrderStatusError,
  changeOrderStatus,
} from "../services/orderStatus";

export const ordersRouter = Router();

type StaffRole = "manager" | "senior_manager" | "admin";

const VALID_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "new",
  "paid",
  "unpaid",
  "cancelled",
]);

const clientUsers = alias(users, "client_users");
const managerUsers = alias(users, "manager_users");

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

// Manager-role actors only see orders they own. Senior managers and admins
// see everything.
function scopeFilter(actorId: string, actorRole: StaffRole): SQL | undefined {
  if (actorRole === "manager") return eq(orders.managerId, actorId);
  return undefined;
}

// GET /orders?q=&page=&pageSize=&clientId=&managerId=&status=
ordersRouter.get(
  "/orders",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const q = String(req.query.q ?? "").trim();
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize ?? "10") || 10),
      );

      const clientIdFilter =
        typeof req.query.clientId === "string" && req.query.clientId
          ? String(req.query.clientId)
          : null;
      const managerIdFilter =
        typeof req.query.managerId === "string" && req.query.managerId
          ? String(req.query.managerId)
          : null;
      const statusRaw =
        typeof req.query.status === "string" && req.query.status
          ? String(req.query.status)
          : null;
      const statusFilter =
        statusRaw && VALID_STATUSES.has(statusRaw as OrderStatus)
          ? (statusRaw as OrderStatus)
          : null;

      const conditions: SQL[] = [];
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
      if (clientIdFilter) conditions.push(eq(orders.clientId, clientIdFilter));
      if (managerIdFilter)
        conditions.push(eq(orders.managerId, managerIdFilter));
      if (statusFilter) conditions.push(eq(orders.status, statusFilter));
      if (q) {
        const like = `%${q}%`;
        const numeric = /^\d+$/.test(q) ? Number(q) : null;
        // Order number exact match (when q is digits) OR client name/email
        // substring. We do NOT join on lateral conditions inside the OR; the
        // join itself is unconditional (every order has a client), so the OR
        // can reference clientUsers columns directly.
        const orParts: SQL[] = [
          ilike(clientUsers.firstName, like),
          ilike(clientUsers.lastName, like),
          ilike(clientUsers.email, like),
        ];
        if (numeric !== null && Number.isSafeInteger(numeric)) {
          orParts.push(eq(orders.orderNumber, numeric));
        }
        const built = or(...orParts);
        if (built) conditions.push(built);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Total count: separate query against the same join (so q can match
      // client fields without losing the count).
      const totalRows = await db
        .select({ total: count() })
        .from(orders)
        .innerJoin(clientUsers, eq(clientUsers.id, orders.clientId))
        .where(where);
      const total = Number(totalRows[0]?.total ?? 0);

      const itemsCountSubquery = db
        .select({
          orderId: orderItems.orderId,
          itemsCount: count().as("items_count"),
        })
        .from(orderItems)
        .groupBy(orderItems.orderId)
        .as("items_count_sq");

      const rows = await db
        .select({
          order: orders,
          client: {
            id: clientUsers.id,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
            email: clientUsers.email,
            avatarUrl: clientUsers.avatarUrl,
          },
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
            email: managerUsers.email,
            avatarUrl: managerUsers.avatarUrl,
          },
          itemsCount: itemsCountSubquery.itemsCount,
        })
        .from(orders)
        .innerJoin(clientUsers, eq(clientUsers.id, orders.clientId))
        .leftJoin(managerUsers, eq(managerUsers.id, orders.managerId))
        .leftJoin(
          itemsCountSubquery,
          eq(itemsCountSubquery.orderId, orders.id),
        )
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({
        orders: rows.map((r) => ({
          id: r.order.id,
          orderNumber: r.order.orderNumber,
          status: r.order.status,
          totalTenge: r.order.totalTenge,
          itemsCount: Number(r.itemsCount ?? 0),
          createdAt: r.order.createdAt,
          statusChangedAt: r.order.statusChangedAt,
          client: r.client as UserSummary,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
        })),
        page,
        pageSize,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /orders/:id — full detail with items.
ordersRouter.get(
  "/orders/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const orderId = req.params.id;

      const orderRows = await db
        .select({
          order: orders,
          client: {
            id: clientUsers.id,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
            email: clientUsers.email,
            avatarUrl: clientUsers.avatarUrl,
          },
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
            email: managerUsers.email,
            avatarUrl: managerUsers.avatarUrl,
          },
        })
        .from(orders)
        .innerJoin(clientUsers, eq(clientUsers.id, orders.clientId))
        .leftJoin(managerUsers, eq(managerUsers.id, orders.managerId))
        .where(eq(orders.id, orderId))
        .limit(1);

      if (orderRows.length === 0) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const r = orderRows[0];
      if (actorRole === "manager" && r.order.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.createdAt));

      res.json({
        order: {
          id: r.order.id,
          orderNumber: r.order.orderNumber,
          status: r.order.status,
          totalTenge: r.order.totalTenge,
          createdAt: r.order.createdAt,
          statusChangedAt: r.order.statusChangedAt,
          client: r.client as UserSummary,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
          items: items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productTitle: it.productTitle,
            productCategoryName: it.productCategoryName,
            productSubtitle: it.productSubtitle,
            unitPriceTenge: it.unitPriceTenge,
            quantity: it.quantity,
            bookedStart: it.bookedStart,
            bookedEnd: it.bookedEnd,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /orders — mobile client creates an order at the moment they tap
// "Open Kaspi". Only role='client' may call this; staff orders go through a
// future admin flow.
ordersRouter.post(
  "/orders",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole;
      if (actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const itemsRaw = Array.isArray(body.items) ? body.items : null;
      if (!itemsRaw || itemsRaw.length === 0) {
        res.status(400).json({ error: "empty_cart" });
        return;
      }

      const input: CreateOrderInputItem[] = [];
      for (const raw of itemsRaw) {
        if (!raw || typeof raw !== "object") {
          res.status(400).json({ error: "invalid_item" });
          return;
        }
        const r = raw as Record<string, unknown>;
        const productId = typeof r.productId === "string" ? r.productId : null;
        if (!productId) {
          res.status(400).json({ error: "invalid_item" });
          return;
        }
        const bookedStart =
          typeof r.bookedStart === "string" && r.bookedStart
            ? r.bookedStart
            : null;
        input.push({ productId, bookedStart });
      }

      const created = await createOrderForClient(actorId, input);
      res.json({ order: { id: created.id, orderNumber: created.orderNumber } });
    } catch (err) {
      if (err instanceof OrderCreationError) {
        const status =
          err.code === "slot_taken" || err.code === "slot_unavailable"
            ? 409
            : 400;
        res.status(status).json({ error: err.code, details: err.details });
        return;
      }
      next(err);
    }
  },
);

// PATCH /orders/:id — staff change status (or future fields). Body:
//   { status: 'new'|'paid'|'unpaid'|'cancelled', force?: boolean }
// `force=true` is honored only when reverting from cancelled and bookings
// conflict; it lets staff revive the order while leaving conflicting bookings
// cancelled.
ordersRouter.patch(
  "/orders/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const orderId = req.params.id;
      const body = req.body as Record<string, unknown>;

      const [existing] = await db
        .select({ id: orders.id, managerId: orders.managerId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      if (actorRole === "manager" && existing.managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      if (typeof body.status !== "string") {
        res.status(400).json({ error: "status_required" });
        return;
      }
      const toStatus = body.status as OrderStatus;
      if (!VALID_STATUSES.has(toStatus)) {
        res.status(400).json({ error: "invalid_status" });
        return;
      }
      const force = body.force === true;

      try {
        await changeOrderStatus(orderId, toStatus, actorId, { force });
      } catch (err) {
        if (err instanceof OrderStatusError) {
          if (err.code === "booking_conflict") {
            res
              .status(409)
              .json({ error: err.code, details: err.details });
            return;
          }
          if (err.code === "order_not_found") {
            res.status(404).json({ error: err.code });
            return;
          }
          res.status(400).json({ error: err.code });
          return;
        }
        throw err;
      }

      // Re-read for response (consistent with the GET shape).
      const [r] = await db
        .select({
          order: orders,
          client: {
            id: clientUsers.id,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
            email: clientUsers.email,
            avatarUrl: clientUsers.avatarUrl,
          },
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
            email: managerUsers.email,
            avatarUrl: managerUsers.avatarUrl,
          },
        })
        .from(orders)
        .innerJoin(clientUsers, eq(clientUsers.id, orders.clientId))
        .leftJoin(managerUsers, eq(managerUsers.id, orders.managerId))
        .where(eq(orders.id, orderId))
        .limit(1);

      res.json({
        order: {
          id: r.order.id,
          orderNumber: r.order.orderNumber,
          status: r.order.status,
          totalTenge: r.order.totalTenge,
          createdAt: r.order.createdAt,
          statusChangedAt: r.order.statusChangedAt,
          client: r.client as UserSummary,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
