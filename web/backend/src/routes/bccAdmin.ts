// Admin-only (requireAdmin) read views for the BCC payment audit, surfaced in
// the web admin Settings → BCC tab:
//   GET /admin/bcc/transactions        — paginated list of card attempts
//   GET /admin/bcc/transactions/:id    — one attempt + its event journal
//   GET /admin/bcc/events              — paginated BCC event journal
// Read-only. The journal rows come from services/bcc/events.ts (NONCE/P_SIGN
// already redacted at write time). docs/bcc-payment-integration.md §17.

import { Router } from "express";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db";
import { bccEvents, orders, paymentTransactions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";
import {
  getBccConfigForAdmin,
  saveBccConfig,
  type SaveBccInput,
} from "../services/bcc/configStore";

export const bccAdminRouter = Router();

// saveBccConfig's snake_case validation codes → 400 (vs 500 for unexpected).
const BCC_VALIDATION_ERRORS = new Set([
  "bcc_webview_url_invalid",
  "bcc_required_field_missing",
  "bcc_merch_rn_id_invalid",
  "bcc_mac_component_invalid",
  "bcc_key_component_length_mismatch",
  "bcc_mac_key_invalid",
]);

const TX_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;

function pagination(q: Record<string, unknown>): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(q.pageSize) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// GET /admin/bcc/settings — masked view of the active BCC credentials (source
// db/env/none, mode test/prod, MAC-key fingerprint — never the key itself).
bccAdminRouter.get(
  "/admin/bcc/settings",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      res.json(await getBccConfigForAdmin());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/bcc/settings — the business enters/updates prod credentials. The
// MAC key + callback password are write-only (blank = keep current) and stored
// AES-256-GCM-encrypted. Returns the refreshed masked view.
bccAdminRouter.put(
  "/admin/bcc/settings",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const str = (v: unknown): string => (typeof v === "string" ? v : "");
      const input: SaveBccInput = {
        webviewUrl: str(b.webviewUrl),
        merchantId: str(b.merchantId),
        terminalId: str(b.terminalId),
        merchName: str(b.merchName),
        merchRnId: str(b.merchRnId),
        notifyUser: str(b.notifyUser),
        macKey: str(b.macKey),
        macKeyComponentA: str(b.macKeyComponentA),
        macKeyComponentB: str(b.macKeyComponentB),
        notifyPass: str(b.notifyPass),
      };
      await saveBccConfig(input, req.actorId!);
      res.json(await getBccConfigForAdmin());
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (BCC_VALIDATION_ERRORS.has(code)) {
        res.status(400).json({ error: code });
        return;
      }
      if (
        code === "app_encryption_key_unset" ||
        code === "app_encryption_key_invalid_length"
      ) {
        res.status(503).json({ error: "encryption_not_configured" });
        return;
      }
      next(err);
    }
  },
);

// GET /admin/bcc/transactions?status=&orderNumber=&page=&pageSize=
bccAdminRouter.get(
  "/admin/bcc/transactions",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { page, pageSize, offset } = pagination(req.query);
      const statusRaw =
        typeof req.query.status === "string" ? req.query.status : "";
      const orderNumberRaw = Number(req.query.orderNumber);

      const filters: (SQL | undefined)[] = [
        TX_STATUSES.has(statusRaw)
          ? eq(paymentTransactions.status, statusRaw as never)
          : undefined,
        Number.isInteger(orderNumberRaw)
          ? eq(orders.orderNumber, orderNumberRaw)
          : undefined,
      ];
      const where = and(...filters);

      const rows = await db
        .select({
          id: paymentTransactions.id,
          bccOrder: paymentTransactions.bccOrder,
          status: paymentTransactions.status,
          amountTenge: paymentTransactions.amountTenge,
          rc: paymentTransactions.rc,
          rcText: paymentTransactions.rcText,
          cardMask: paymentTransactions.cardMask,
          createdAt: paymentTransactions.createdAt,
          updatedAt: paymentTransactions.updatedAt,
          orderId: paymentTransactions.orderId,
          orderNumber: orders.orderNumber,
          orderPaymentStatus: orders.paymentStatus,
        })
        .from(paymentTransactions)
        .leftJoin(orders, eq(orders.id, paymentTransactions.orderId))
        .where(where)
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(paymentTransactions)
        .leftJoin(orders, eq(orders.id, paymentTransactions.orderId))
        .where(where);

      res.json({ items: rows, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/bcc/transactions/:id — one attempt + its event journal
bccAdminRouter.get(
  "/admin/bcc/transactions/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const [tx] = await db
        .select({
          id: paymentTransactions.id,
          provider: paymentTransactions.provider,
          bccOrder: paymentTransactions.bccOrder,
          status: paymentTransactions.status,
          amountTenge: paymentTransactions.amountTenge,
          action: paymentTransactions.action,
          rc: paymentTransactions.rc,
          rcText: paymentTransactions.rcText,
          rrn: paymentTransactions.rrn,
          intRef: paymentTransactions.intRef,
          cardMask: paymentTransactions.cardMask,
          rawRequest: paymentTransactions.rawRequest,
          rawCallback: paymentTransactions.rawCallback,
          createdAt: paymentTransactions.createdAt,
          updatedAt: paymentTransactions.updatedAt,
          orderId: paymentTransactions.orderId,
          orderNumber: orders.orderNumber,
          orderPaymentStatus: orders.paymentStatus,
        })
        .from(paymentTransactions)
        .leftJoin(orders, eq(orders.id, paymentTransactions.orderId))
        .where(eq(paymentTransactions.id, req.params.id))
        .limit(1);

      if (!tx) {
        res.status(404).json({ error: "transaction_not_found" });
        return;
      }

      const events = await db
        .select()
        .from(bccEvents)
        .where(eq(bccEvents.paymentTransactionId, tx.id))
        .orderBy(desc(bccEvents.createdAt));

      res.json({ transaction: tx, events });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/bcc/events?kind=&outcome=&orderNumber=&page=&pageSize=
bccAdminRouter.get(
  "/admin/bcc/events",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { page, pageSize, offset } = pagination(req.query);
      const kind = typeof req.query.kind === "string" ? req.query.kind : "";
      const outcome =
        typeof req.query.outcome === "string" ? req.query.outcome : "";
      const orderNumberRaw = Number(req.query.orderNumber);

      const filters: (SQL | undefined)[] = [
        kind ? eq(bccEvents.kind, kind) : undefined,
        outcome ? eq(bccEvents.outcome, outcome) : undefined,
        Number.isInteger(orderNumberRaw)
          ? eq(orders.orderNumber, orderNumberRaw)
          : undefined,
      ];
      const where = and(...filters);

      const rows = await db
        .select({
          id: bccEvents.id,
          createdAt: bccEvents.createdAt,
          kind: bccEvents.kind,
          trtype: bccEvents.trtype,
          outcome: bccEvents.outcome,
          action: bccEvents.action,
          rc: bccEvents.rc,
          rcText: bccEvents.rcText,
          httpStatus: bccEvents.httpStatus,
          note: bccEvents.note,
          payload: bccEvents.payload,
          bccOrder: bccEvents.bccOrder,
          paymentTransactionId: bccEvents.paymentTransactionId,
          orderId: bccEvents.orderId,
          orderNumber: orders.orderNumber,
        })
        .from(bccEvents)
        .leftJoin(orders, eq(orders.id, bccEvents.orderId))
        .where(where)
        .orderBy(desc(bccEvents.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(bccEvents)
        .leftJoin(orders, eq(orders.id, bccEvents.orderId))
        .where(where);

      res.json({ items: rows, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);
