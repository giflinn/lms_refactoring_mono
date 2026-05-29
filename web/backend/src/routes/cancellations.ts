import { Router } from "express";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import { orderCancellations, orderItems, orders, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaff } from "../middleware/requireRole";
import {
  CancellationError,
  CancellationStatus,
  createCancellationForClient,
  decideCancellation,
} from "../services/cancellationService";
import { changeOrderPaymentStatus } from "../services/orderStatus";
import { refundCardOrder } from "../services/bcc/refund";

export const cancellationsRouter = Router();

type StaffRole = "manager" | "senior_manager" | "admin";

const VALID_STATUSES: ReadonlySet<CancellationStatus> = new Set([
  "requested",
  "approved",
  "rejected",
]);

const clientUsers = alias(users, "client_users");
const managerUsers = alias(users, "manager_users");
const decidedByUsers = alias(users, "decided_by_users");

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

function scopeFilter(actorId: string, actorRole: StaffRole): SQL | undefined {
  if (actorRole === "manager") {
    return eq(orderCancellations.managerId, actorId);
  }
  return undefined;
}

function statusErrorToHttp(err: CancellationError): {
  status: number;
  body: { error: string; details?: unknown };
} {
  switch (err.code) {
    case "order_not_found":
    case "cancellation_not_found":
      return { status: 404, body: { error: err.code } };
    case "forbidden":
      return { status: 403, body: { error: err.code } };
    case "cancellation_already_pending":
    case "cancellation_already_decided":
      return { status: 409, body: { error: err.code } };
    case "order_not_cancellable":
    case "cancellation_window_closed":
      return { status: 409, body: { error: err.code } };
    default:
      return { status: 400, body: { error: err.code, details: err.details } };
  }
}

// POST /me/orders/:id/cancellation — client-initiated request. Body:
//   { reason?: string }
// Returns the created cancellation id; the order's fulfillment_status stays
// 'active' until a staff decision lands.
cancellationsRouter.post(
  "/me/orders/:id/cancellation",
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
      const orderId = req.params.id;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const reason =
        typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

      const created = await createCancellationForClient({
        clientId: actorId,
        orderId,
        clientReason: reason,
      });
      res.json({ cancellation: { id: created.id } });
    } catch (err) {
      if (err instanceof CancellationError) {
        const { status, body } = statusErrorToHttp(err);
        res.status(status).json(body);
        return;
      }
      next(err);
    }
  },
);

// GET /cancellations?q=&page=&pageSize=&status=&clientId=&managerId=
cancellationsRouter.get(
  "/cancellations",
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

      const statusRaw =
        typeof req.query.status === "string" && req.query.status
          ? String(req.query.status)
          : null;
      const statusFilter =
        statusRaw && VALID_STATUSES.has(statusRaw as CancellationStatus)
          ? (statusRaw as CancellationStatus)
          : null;

      const clientIdFilter =
        typeof req.query.clientId === "string" && req.query.clientId
          ? String(req.query.clientId)
          : null;
      const managerIdFilter =
        typeof req.query.managerId === "string" && req.query.managerId
          ? String(req.query.managerId)
          : null;

      const conditions: SQL[] = [];
      const scope = scopeFilter(actorId, actorRole);
      if (scope) conditions.push(scope);
      if (statusFilter) conditions.push(eq(orderCancellations.status, statusFilter));
      if (clientIdFilter)
        conditions.push(eq(orderCancellations.clientId, clientIdFilter));
      if (managerIdFilter)
        conditions.push(eq(orderCancellations.managerId, managerIdFilter));
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
        .from(orderCancellations)
        .innerJoin(orders, eq(orders.id, orderCancellations.orderId))
        .innerJoin(clientUsers, eq(clientUsers.id, orderCancellations.clientId))
        .where(where);
      const total = Number(totalRows[0]?.total ?? 0);

      const rows = await db
        .select({
          cancellation: orderCancellations,
          orderNumber: orders.orderNumber,
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
        .from(orderCancellations)
        .innerJoin(orders, eq(orders.id, orderCancellations.orderId))
        .innerJoin(clientUsers, eq(clientUsers.id, orderCancellations.clientId))
        .leftJoin(
          managerUsers,
          eq(managerUsers.id, orderCancellations.managerId),
        )
        .where(where)
        .orderBy(desc(orderCancellations.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({
        cancellations: rows.map((r) => ({
          id: r.cancellation.id,
          orderId: r.cancellation.orderId,
          orderNumber: r.orderNumber,
          status: r.cancellation.status,
          createdAt: r.cancellation.createdAt,
          decidedAt: r.cancellation.decidedAt,
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

// GET /cancellations/:id — full detail used by the drawer.
cancellationsRouter.get(
  "/cancellations/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const cancellationId = req.params.id;

      const [r] = await db
        .select({
          cancellation: orderCancellations,
          orderNumber: orders.orderNumber,
          orderTotalTenge: orders.totalTenge,
          orderFulfillmentStatus: orders.fulfillmentStatus,
          orderPaymentStatus: orders.paymentStatus,
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
          decidedBy: {
            id: decidedByUsers.id,
            firstName: decidedByUsers.firstName,
            lastName: decidedByUsers.lastName,
            email: decidedByUsers.email,
            avatarUrl: decidedByUsers.avatarUrl,
          },
        })
        .from(orderCancellations)
        .innerJoin(orders, eq(orders.id, orderCancellations.orderId))
        .innerJoin(clientUsers, eq(clientUsers.id, orderCancellations.clientId))
        .leftJoin(
          managerUsers,
          eq(managerUsers.id, orderCancellations.managerId),
        )
        .leftJoin(
          decidedByUsers,
          eq(decidedByUsers.id, orderCancellations.decidedByUserId),
        )
        .where(eq(orderCancellations.id, cancellationId))
        .limit(1);

      if (!r) {
        res.status(404).json({ error: "cancellation_not_found" });
        return;
      }
      if (
        actorRole === "manager" &&
        r.cancellation.managerId !== actorId
      ) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, r.cancellation.orderId))
        .orderBy(asc(orderItems.createdAt));

      res.json({
        cancellation: {
          id: r.cancellation.id,
          orderId: r.cancellation.orderId,
          orderNumber: r.orderNumber,
          orderTotalTenge: r.orderTotalTenge,
          orderFulfillmentStatus: r.orderFulfillmentStatus,
          orderPaymentStatus: r.orderPaymentStatus,
          status: r.cancellation.status,
          clientReason: r.cancellation.clientReason,
          decisionComment: r.cancellation.decisionComment,
          createdAt: r.cancellation.createdAt,
          decidedAt: r.cancellation.decidedAt,
          client: r.client as UserSummary,
          manager:
            r.manager?.id !== null && r.manager?.id !== undefined
              ? (r.manager as UserSummary)
              : null,
          decidedBy:
            r.decidedBy?.id !== null && r.decidedBy?.id !== undefined
              ? (r.decidedBy as UserSummary)
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

// PATCH /cancellations/:id — staff decision. Body:
//   { decision: 'approved'|'rejected', comment?: string }
cancellationsRouter.patch(
  "/cancellations/:id",
  requireAuth,
  requireStaff,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      const actorRole = req.actorRole as StaffRole;
      const cancellationId = req.params.id;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const decisionRaw =
        typeof body.decision === "string" ? body.decision : null;
      if (decisionRaw !== "approved" && decisionRaw !== "rejected") {
        res.status(400).json({ error: "invalid_decision" });
        return;
      }
      const comment =
        typeof body.comment === "string" ? body.comment.slice(0, 1000) : null;

      // Pre-flight RBAC on manager-role: refuse if the row isn't theirs. The
      // service runs in its own transaction and trusts actorId.
      if (actorRole === "manager") {
        const [own] = await db
          .select({ managerId: orderCancellations.managerId })
          .from(orderCancellations)
          .where(eq(orderCancellations.id, cancellationId))
          .limit(1);
        if (!own) {
          res.status(404).json({ error: "cancellation_not_found" });
          return;
        }
        if (own.managerId !== actorId) {
          res.status(403).json({ error: "forbidden" });
          return;
        }
      }

      try {
        await decideCancellation({
          cancellationId,
          actorId,
          decision: decisionRaw,
          decisionComment: comment,
        });
      } catch (err) {
        if (err instanceof CancellationError) {
          const { status, body: errBody } = statusErrorToHttp(err);
          res.status(status).json(errBody);
          return;
        }
        throw err;
      }

      // Card orders: an approved cancellation auto-refunds the captured payment
      // via BCC, then flips payment_status to 'refunded'. Best-effort — the
      // cancellation already succeeded (fulfillment is cancelled); on a refund
      // failure staff can retry from the order drawer. We report the outcome so
      // the client shows the right message. docs/bcc-payment-integration.md §6/§8.
      let refund: "refunded" | "failed" | "none" = "none";
      if (decisionRaw === "approved") {
        try {
          const [c] = await db
            .select({ orderId: orderCancellations.orderId })
            .from(orderCancellations)
            .where(eq(orderCancellations.id, cancellationId))
            .limit(1);
          if (c) {
            const result = await refundCardOrder(c.orderId);
            if (result.outcome === "refunded") {
              await changeOrderPaymentStatus(c.orderId, "refunded", actorId);
              refund = "refunded";
            } else if (result.outcome === "error") {
              refund = "failed";
              console.error(
                "[cancellations] card auto-refund failed",
                c.orderId,
                result.errorCode,
              );
            }
          }
        } catch (err) {
          refund = "failed";
          console.error("[cancellations] card auto-refund hook error:", err);
        }
      }

      res.json({ ok: true, refund });
    } catch (err) {
      next(err);
    }
  },
);
