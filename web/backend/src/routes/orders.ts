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
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, products, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaff } from "../middleware/requireRole";
import {
  CreateOrderInputItem,
  OrderCreationError,
  createOrderForClient,
} from "../services/orderCreate";
import {
  FulfillmentStatus,
  OrderStatusError,
  PaymentStatus,
  changeOrderFulfillmentStatus,
  changeOrderPaymentStatus,
} from "../services/orderStatus";

export const ordersRouter = Router();

type StaffRole = "manager" | "senior_manager" | "admin";

const VALID_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "pending",
  "paid",
  "unpaid",
  "refunded",
]);
const VALID_FULFILLMENT_STATUSES: ReadonlySet<FulfillmentStatus> = new Set([
  "new",
  "active",
  "completed",
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

// GET /me/orders — the calling client's own purchases. Mobile cabinet uses
// this for the "Мои покупки" tabs (новые/активные/завершенные/отмененные).
// Includes per-order item titles so the card can list product names instead
// of an item count, and the assigned manager's name.
ordersRouter.get(
  "/me/orders",
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

      const rows = await db
        .select({
          order: orders,
          manager: {
            id: managerUsers.id,
            firstName: managerUsers.firstName,
            lastName: managerUsers.lastName,
          },
        })
        .from(orders)
        .leftJoin(managerUsers, eq(managerUsers.id, orders.managerId))
        .where(eq(orders.clientId, actorId))
        .orderBy(desc(orders.createdAt));

      const orderIds = rows.map((r) => r.order.id);
      // Fetch items joined with their product so we can read
      // daysUntilCancel — used to compute the cancel deadline shown to the
      // client (mobile hides "Отменить заказ" once it passes).
      const itemRows =
        orderIds.length === 0
          ? []
          : await db
              .select({
                orderId: orderItems.orderId,
                productTitle: orderItems.productTitle,
                daysUntilCancel: products.daysUntilCancel,
                createdAt: orderItems.createdAt,
              })
              .from(orderItems)
              .innerJoin(products, eq(products.id, orderItems.productId))
              .where(inArray(orderItems.orderId, orderIds))
              .orderBy(asc(orderItems.createdAt));

      const titlesByOrder = new Map<string, string[]>();
      const minDaysByOrder = new Map<string, number>();
      for (const it of itemRows) {
        const list = titlesByOrder.get(it.orderId) ?? [];
        list.push(it.productTitle);
        titlesByOrder.set(it.orderId, list);
        const prev = minDaysByOrder.get(it.orderId);
        if (prev === undefined || it.daysUntilCancel < prev) {
          minDaysByOrder.set(it.orderId, it.daysUntilCancel);
        }
      }

      res.json({
        orders: rows.map((r) => {
          const minDays = minDaysByOrder.get(r.order.id);
          // Cancel window opens when payment first lands and runs for the
          // strictest (smallest) daysUntilCancel of any item in the order.
          // Without firstPaidAt or items the deadline is unknown — return
          // null and let the client decide.
          const deadline =
            r.order.firstPaidAt && minDays !== undefined
              ? new Date(
                  r.order.firstPaidAt.getTime() + minDays * 86_400_000,
                )
              : null;
          return {
            id: r.order.id,
            orderNumber: r.order.orderNumber,
            paymentStatus: r.order.paymentStatus,
            fulfillmentStatus: r.order.fulfillmentStatus,
            totalTenge: r.order.totalTenge,
            createdAt: r.order.createdAt,
            firstPaidAt: r.order.firstPaidAt,
            statusChangedAt: r.order.statusChangedAt,
            cancellationDeadline: deadline,
            productTitles: titlesByOrder.get(r.order.id) ?? [],
            manager:
              r.manager?.id !== null && r.manager?.id !== undefined
                ? {
                    id: r.manager.id,
                    firstName: r.manager.firstName,
                    lastName: r.manager.lastName,
                  }
                : null,
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /orders?q=&page=&pageSize=&clientId=&managerId=&paymentStatus=&fulfillmentStatus=
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
      const paymentStatusRaw =
        typeof req.query.paymentStatus === "string" && req.query.paymentStatus
          ? String(req.query.paymentStatus)
          : null;
      const paymentStatusFilter =
        paymentStatusRaw &&
        VALID_PAYMENT_STATUSES.has(paymentStatusRaw as PaymentStatus)
          ? (paymentStatusRaw as PaymentStatus)
          : null;
      const fulfillmentStatusRaw =
        typeof req.query.fulfillmentStatus === "string" &&
        req.query.fulfillmentStatus
          ? String(req.query.fulfillmentStatus)
          : null;
      const fulfillmentStatusFilter =
        fulfillmentStatusRaw &&
        VALID_FULFILLMENT_STATUSES.has(
          fulfillmentStatusRaw as FulfillmentStatus,
        )
          ? (fulfillmentStatusRaw as FulfillmentStatus)
          : null;

      const conditions: SQL[] = [];
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
      if (clientIdFilter) conditions.push(eq(orders.clientId, clientIdFilter));
      if (managerIdFilter)
        conditions.push(eq(orders.managerId, managerIdFilter));
      if (paymentStatusFilter)
        conditions.push(eq(orders.paymentStatus, paymentStatusFilter));
      if (fulfillmentStatusFilter)
        conditions.push(
          eq(orders.fulfillmentStatus, fulfillmentStatusFilter),
        );
      if (q) {
        const like = `%${q}%`;
        const numeric = /^\d+$/.test(q) ? Number(q) : null;
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
          paymentStatus: r.order.paymentStatus,
          fulfillmentStatus: r.order.fulfillmentStatus,
          totalTenge: r.order.totalTenge,
          itemsCount: Number(r.itemsCount ?? 0),
          createdAt: r.order.createdAt,
          firstPaidAt: r.order.firstPaidAt,
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
          paymentStatus: r.order.paymentStatus,
          fulfillmentStatus: r.order.fulfillmentStatus,
          totalTenge: r.order.totalTenge,
          createdAt: r.order.createdAt,
          firstPaidAt: r.order.firstPaidAt,
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
            expiresAt: it.expiresAt,
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
      res.json({
        order: { id: created.id, orderNumber: created.orderNumber },
      });
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

// PATCH /orders/:id — staff update payment and/or fulfillment status. Body:
//   { paymentStatus?: 'new'|'paid'|'unpaid'|'refunded',
//     fulfillmentStatus?: 'active'|'completed'|'cancelled',
//     force?: boolean }
// At least one of the two status fields is required. `force=true` is honored
// only when reverting fulfillment from 'cancelled' and bookings conflict; it
// lets staff revive the order while leaving conflicting bookings cancelled.
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

      const paymentStatusRaw =
        typeof body.paymentStatus === "string" ? body.paymentStatus : null;
      const fulfillmentStatusRaw =
        typeof body.fulfillmentStatus === "string"
          ? body.fulfillmentStatus
          : null;
      if (!paymentStatusRaw && !fulfillmentStatusRaw) {
        res.status(400).json({ error: "status_required" });
        return;
      }
      if (
        paymentStatusRaw &&
        !VALID_PAYMENT_STATUSES.has(paymentStatusRaw as PaymentStatus)
      ) {
        res.status(400).json({ error: "invalid_payment_status" });
        return;
      }
      if (
        fulfillmentStatusRaw &&
        !VALID_FULFILLMENT_STATUSES.has(
          fulfillmentStatusRaw as FulfillmentStatus,
        )
      ) {
        res.status(400).json({ error: "invalid_fulfillment_status" });
        return;
      }
      const force = body.force === true;

      try {
        // Apply payment first so first_paid_at side-effects land before any
        // fulfillment change in the same request observes them.
        if (paymentStatusRaw) {
          await changeOrderPaymentStatus(
            orderId,
            paymentStatusRaw as PaymentStatus,
            actorId,
          );
        }
        if (fulfillmentStatusRaw) {
          await changeOrderFulfillmentStatus(
            orderId,
            fulfillmentStatusRaw as FulfillmentStatus,
            actorId,
            { force },
          );
        }
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
          paymentStatus: r.order.paymentStatus,
          fulfillmentStatus: r.order.fulfillmentStatus,
          totalTenge: r.order.totalTenge,
          createdAt: r.order.createdAt,
          firstPaidAt: r.order.firstPaidAt,
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
