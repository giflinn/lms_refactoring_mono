// Mobile-facing order detail. The list endpoint /me/orders returns enough
// for the cards (title list + statuses); this gives the per-item detail the
// new mobile order detail page needs:
//   - Coach booking: bookedStart / bookedEnd / slotInfo
//   - Telegram grant: telegramGroup info + membership state + inviteLink
//   - Plain product: just the snapshot fields
//
// Plus a sibling write-only endpoint that mints/refreshes a per-user invite
// link for a Telegram-grant item. Used by the "Открыть в Telegram" CTA when
// the user has linked Telegram but the membership row hasn't been issued an
// invite yet (e.g. the grant ran before linking).

import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  lmsCourses,
  orderItems,
  orders,
  products,
  telegramGroups,
  telegramMemberships,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";
import { tryIssueInviteLink } from "../services/telegram/grants";

export const meOrdersRouter = Router();

meOrdersRouter.get(
  "/me/orders/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const orderId = req.params.id;

      const orderRows = await db
        .select({
          order: orders,
          managerFirst: users.firstName,
          managerLast: users.lastName,
          managerId: users.id,
        })
        .from(orders)
        .leftJoin(users, eq(users.id, orders.managerId))
        .where(eq(orders.id, orderId))
        .limit(1);
      if (orderRows.length === 0) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const r = orderRows[0];
      if (r.order.clientId !== actorId) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }

      const items = await db
        .select({
          item: orderItems,
          telegramGroupId: products.telegramGroupId,
          durationMinutes: products.durationMinutes,
          lmsCourseId: products.lmsCourseId,
          telegramGroup: {
            id: telegramGroups.id,
            title: telegramGroups.title,
            chatType: telegramGroups.chatType,
            inviteUsername: telegramGroups.inviteUsername,
            description: telegramGroups.description,
          },
          lmsCourse: {
            id: lmsCourses.id,
            title: lmsCourses.title,
            coverImageUrl: lmsCourses.coverImageUrl,
          },
        })
        .from(orderItems)
        .innerJoin(products, eq(products.id, orderItems.productId))
        .leftJoin(
          telegramGroups,
          eq(telegramGroups.id, products.telegramGroupId),
        )
        .leftJoin(lmsCourses, eq(lmsCourses.id, products.lmsCourseId))
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.createdAt));

      // Pull memberships for the items in this order so the mobile can render
      // joined / pending / kicked state per item without a second round-trip.
      const itemIds = items.map((i) => i.item.id);
      const memberships =
        itemIds.length === 0
          ? []
          : await db
              .select()
              .from(telegramMemberships)
              .where(
                and(
                  eq(telegramMemberships.userId, actorId),
                  inArray(telegramMemberships.orderItemId, itemIds),
                ),
              )
              .orderBy(desc(telegramMemberships.createdAt));
      const membershipByItem = new Map<
        string,
        typeof telegramMemberships.$inferSelect
      >();
      for (const m of memberships) {
        if (!m.orderItemId) continue;
        // Latest-wins for an order_item. There should only be one row but
        // defensive ordering protects against race-y double-grants.
        if (!membershipByItem.has(m.orderItemId)) {
          membershipByItem.set(m.orderItemId, m);
        }
      }

      res.json({
        order: {
          id: r.order.id,
          orderNumber: r.order.orderNumber,
          paymentStatus: r.order.paymentStatus,
          fulfillmentStatus: r.order.fulfillmentStatus,
          totalTenge: r.order.totalTenge,
          createdAt: r.order.createdAt.toISOString(),
          firstPaidAt: r.order.firstPaidAt?.toISOString() ?? null,
          statusChangedAt: r.order.statusChangedAt.toISOString(),
          manager: r.managerId
            ? {
                id: r.managerId,
                firstName: r.managerFirst!,
                lastName: r.managerLast!,
              }
            : null,
          items: items.map((row) => {
            const it = row.item;
            const m = membershipByItem.get(it.id);
            return {
              id: it.id,
              productId: it.productId,
              productTitle: it.productTitle,
              productCategoryName: it.productCategoryName,
              productSubtitle: it.productSubtitle,
              unitPriceTenge: it.unitPriceTenge,
              quantity: it.quantity,
              bookedStart: it.bookedStart?.toISOString() ?? null,
              bookedEnd: it.bookedEnd?.toISOString() ?? null,
              expiresAt: it.expiresAt?.toISOString() ?? null,
              durationMinutes: row.durationMinutes,
              telegramGroup: row.telegramGroup?.id
                ? {
                    id: row.telegramGroup.id,
                    title: row.telegramGroup.title,
                    chatType: row.telegramGroup.chatType,
                    inviteUsername: row.telegramGroup.inviteUsername,
                    description: row.telegramGroup.description,
                  }
                : null,
              telegramMembership: m
                ? {
                    id: m.id,
                    status: m.status,
                    inviteLink: m.inviteLink,
                    joinedAt: m.joinedAt?.toISOString() ?? null,
                    expiresAt: m.expiresAt?.toISOString() ?? null,
                  }
                : null,
              lmsCourse: row.lmsCourse?.id
                ? {
                    id: row.lmsCourse.id,
                    title: row.lmsCourse.title,
                    coverImageUrl: row.lmsCourse.coverImageUrl,
                  }
                : null,
            };
          }),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /me/orders/:id/items/:itemId/telegram-invite
//   Returns the per-user invite URL for a Telegram-grant item. Generates
//   one on demand if the membership row exists but the invite link was
//   skipped at grant time (e.g. user wasn't linked yet). Errors:
//     telegram_not_linked       — user hasn't completed /start <token>
//     not_a_telegram_item       — wrong item kind
//     membership_inactive       — grant was revoked / kicked / left
//     invite_unavailable        — bot is not admin in the chat
meOrdersRouter.post(
  "/me/orders/:id/items/:itemId/telegram-invite",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId as string;
      if (req.actorRole !== "client") {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const itemRows = await db
        .select({
          item: orderItems,
          orderClientId: orders.clientId,
          telegramGroupId: products.telegramGroupId,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(
          and(
            eq(orderItems.id, req.params.itemId),
            eq(orderItems.orderId, req.params.id),
          ),
        )
        .limit(1);
      if (itemRows.length === 0) {
        res.status(404).json({ error: "item_not_found" });
        return;
      }
      const row = itemRows[0];
      if (row.orderClientId !== actorId) {
        res.status(404).json({ error: "item_not_found" });
        return;
      }
      if (!row.telegramGroupId) {
        res.status(400).json({ error: "not_a_telegram_item" });
        return;
      }

      const userRow = (
        await db
          .select({ telegramUserId: users.telegramUserId })
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1)
      )[0];
      if (!userRow?.telegramUserId) {
        res.status(409).json({ error: "telegram_not_linked" });
        return;
      }

      const membership = (
        await db
          .select()
          .from(telegramMemberships)
          .where(eq(telegramMemberships.orderItemId, row.item.id))
          .orderBy(desc(telegramMemberships.createdAt))
          .limit(1)
      )[0];
      if (!membership) {
        res.status(409).json({ error: "membership_not_found" });
        return;
      }
      if (membership.status !== "pending" && membership.status !== "joined") {
        res.status(409).json({ error: "membership_inactive" });
        return;
      }

      // If joined and we have a link cached, return it. If joined and no
      // link, surface a public username if any (membership row reset its
      // invite_link on leave; subsequent rejoin needs a fresh one).
      if (membership.status === "joined" && membership.inviteLink) {
        res.json({
          inviteLink: membership.inviteLink,
          status: membership.status,
        });
        return;
      }

      // Pending — ensure a link exists.
      if (!membership.inviteLink) {
        await tryIssueInviteLink(membership.id, row.telegramGroupId);
      }
      const refreshed = (
        await db
          .select()
          .from(telegramMemberships)
          .where(eq(telegramMemberships.id, membership.id))
          .limit(1)
      )[0];
      if (!refreshed?.inviteLink) {
        res.status(503).json({ error: "invite_unavailable" });
        return;
      }
      res.json({
        inviteLink: refreshed.inviteLink,
        status: refreshed.status,
      });
    } catch (err) {
      next(err);
    }
  },
);
