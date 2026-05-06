// Business-logic glue between order lifecycle and Telegram membership table.
// Three operations matter:
//
//   grantTelegramAccessForOrder(orderId)
//     Called when an order transitions to fulfillment 'active' (typically on
//     first paid). For each item with a telegramGroupId we ensure a
//     telegram_memberships row exists (status='pending'); if the user has
//     already linked Telegram, we also issue the per-user invite link right
//     away and push them. Idempotent — re-running on revival is safe.
//
//   revokeTelegramAccessForOrder(orderId)
//     Called when an order transitions to fulfillment 'cancelled' or
//     'completed'. For each affected membership: revoke the pending invite,
//     and (if no other active membership keeps the user in the same chat)
//     kick them. The "keep them if any other order still grants access" rule
//     supports overlapping subscriptions cleanly.
//
//   ensureInviteLinksForUser(userId)
//     Called from the bot after /start <token> succeeds. Walks every
//     pending-and-no-link membership for the user and generates invite URLs.
//     The single source of "user is now linked, surface their grants" logic
//     so the bot handler can stay thin.
//
// All Telegram API calls are best-effort: failures are logged + recorded on
// the membership row so the admin can resync. The DB mutations always
// proceed so the next status flip can re-attempt the Telegram side.

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db";
import {
  orderItems,
  orders,
  products,
  telegramGroups,
  telegramMemberships,
  users,
} from "../../db/schema";
import { sendPushToUser } from "../push";
import { describeApiError } from "./bot";
import {
  createPerUserInviteLink,
  deleteBotMessage,
  editBotMessage,
  kickUser,
  revokeInviteLink,
} from "./links";

export async function grantTelegramAccessForOrder(orderId: string): Promise<void> {
  const orderRows = await db
    .select({ clientId: orders.clientId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (orderRows.length === 0) return;
  const clientId = orderRows[0].clientId;

  const itemRows = await db
    .select({
      orderItemId: orderItems.id,
      productTelegramGroupId: products.telegramGroupId,
      productTitle: orderItems.productTitle,
      itemExpiresAt: orderItems.expiresAt,
    })
    .from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, orderId));

  const telegramItems = itemRows.filter((r) => r.productTelegramGroupId !== null);
  if (telegramItems.length === 0) return;

  const userRows = await db
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);
  const userTelegramId = userRows[0]?.telegramUserId ?? null;

  for (const item of telegramItems) {
    await grantOneItem({
      orderItemId: item.orderItemId,
      telegramGroupId: item.productTelegramGroupId!,
      userId: clientId,
      userTelegramId,
      itemExpiresAt: item.itemExpiresAt,
      productTitle: item.productTitle,
    });
  }
}

async function grantOneItem(params: {
  orderItemId: string;
  telegramGroupId: string;
  userId: string;
  userTelegramId: string | null;
  itemExpiresAt: Date | null;
  productTitle: string;
}): Promise<void> {
  // Reuse an existing active membership row for this exact item if any —
  // covers double-firing (cron retry, admin re-paid) without duplicating.
  const existing = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.orderItemId, params.orderItemId),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    )
    .limit(1);

  let membership = existing[0];
  let firstTime = false;
  if (!membership) {
    const [inserted] = await db
      .insert(telegramMemberships)
      .values({
        userId: params.userId,
        telegramGroupId: params.telegramGroupId,
        orderItemId: params.orderItemId,
        status: "pending",
        expiresAt: params.itemExpiresAt,
      })
      .returning();
    membership = inserted;
    firstTime = true;
  } else if (membership.expiresAt?.getTime() !== params.itemExpiresAt?.getTime()) {
    await db
      .update(telegramMemberships)
      .set({ expiresAt: params.itemExpiresAt, updatedAt: new Date() })
      .where(eq(telegramMemberships.id, membership.id));
  }

  // If user has linked Telegram + group bot is admin, ensure invite link.
  if (params.userTelegramId && !membership.inviteLink) {
    await tryIssueInviteLink(membership.id, params.telegramGroupId);
  }

  if (firstTime) {
    await pushAccessGranted(
      params.userId,
      params.productTitle,
      params.userTelegramId !== null,
    );
  }
}

// Best-effort invite-link issuance for a single membership. Re-loads the
// row at the end to capture inviteLink/inviteLinkName atomically. Reuses
// an existing sibling membership's link when one is already pending/joined
// for the same (user, group) pair so the mobile detail page shows a stable
// URL across overlapping orders.
export async function tryIssueInviteLink(
  membershipId: string,
  telegramGroupId: string,
): Promise<void> {
  const groupRows = await db
    .select()
    .from(telegramGroups)
    .where(eq(telegramGroups.id, telegramGroupId))
    .limit(1);
  const group = groupRows[0];
  if (!group || group.botStatus !== "admin" || group.archivedAt) {
    return;
  }
  const membershipRow = await db
    .select()
    .from(telegramMemberships)
    .where(eq(telegramMemberships.id, membershipId))
    .limit(1);
  const m = membershipRow[0];
  if (!m || m.inviteLink) return;

  const sibling = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, m.userId),
        eq(telegramMemberships.telegramGroupId, m.telegramGroupId),
        ne(telegramMemberships.id, m.id),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    );
  const reusableLink = sibling.find((s) => s.inviteLink)?.inviteLink ?? null;
  if (reusableLink) {
    await db
      .update(telegramMemberships)
      .set({ inviteLink: reusableLink, updatedAt: new Date() })
      .where(eq(telegramMemberships.id, m.id));
    return;
  }

  try {
    const link = await createPerUserInviteLink({
      chatId: group.chatId,
      membershipId: m.id,
    });
    await db
      .update(telegramMemberships)
      .set({
        inviteLink: link.url,
        inviteLinkName: link.name,
        updatedAt: new Date(),
      })
      .where(eq(telegramMemberships.id, m.id));
  } catch (err) {
    console.error(
      `[telegram] failed to issue invite link for membership ${m.id}: ${describeApiError(err)}`,
    );
  }
}

// Walks all pending-no-link memberships for a user (called from the bot's
// /start handler in Stage 3) and tries to issue an invite link for each.
export async function ensureInviteLinksForUser(userId: string): Promise<void> {
  const pending = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, userId),
        eq(telegramMemberships.status, "pending"),
      ),
    );
  for (const m of pending) {
    if (m.inviteLink) continue;
    await tryIssueInviteLink(m.id, m.telegramGroupId);
  }
}

// Tear down access for an order. Used on transition to 'cancelled' OR
// 'completed' — both end the order's lifecycle and any granted access.
export async function revokeTelegramAccessForOrder(
  orderId: string,
): Promise<void> {
  const itemRows = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (itemRows.length === 0) return;
  const itemIds = itemRows.map((r) => r.id);

  const memberships = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        inArray(telegramMemberships.orderItemId, itemIds),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    );
  if (memberships.length === 0) return;

  for (const m of memberships) {
    await revokeOneMembership(m);
  }
}

// Public alias of the internal teardown — exposed so the lifecycle cron can
// kick a single expired membership without rebuilding the (DB + Telegram +
// push) sequence. Idempotent: a membership already in a terminal state
// short-circuits inside revokeOneMembership.
export async function revokeMembership(
  m: typeof telegramMemberships.$inferSelect,
): Promise<void> {
  await revokeOneMembership(m);
}

async function revokeOneMembership(
  m: typeof telegramMemberships.$inferSelect,
): Promise<void> {
  // Mark teardown timestamp first so a concurrent grant can't pick it up
  // again on the way through the door. Clear inviteLink so future grants
  // for this user/group won't reuse a now-revoked URL.
  const wasJoined = m.status === "joined";
  const now = new Date();
  await db
    .update(telegramMemberships)
    .set({
      status: wasJoined ? "kicked" : "revoked",
      kickedAt: wasJoined ? now : null,
      revokedAt: !wasJoined ? now : null,
      inviteLink: null,
      inviteLinkName: null,
      inviteChatId: null,
      inviteMessageId: null,
      updatedAt: now,
    })
    .where(eq(telegramMemberships.id, m.id));

  // Update the original invite card in the user's DM so it stops looking
  // like an active access — edit to "Доступ закрыт" and strip the keyboard.
  // Falls back to delete if the message can't be edited (rare). Both paths
  // swallow "bot blocked / chat gone" silently.
  if (m.inviteChatId && m.inviteMessageId != null) {
    const edited = await editBotMessage({
      chatId: m.inviteChatId,
      messageId: m.inviteMessageId,
      text: "Доступ к этой группе закрыт.",
      inlineUrlKeyboard: null,
    });
    if (!edited) {
      await deleteBotMessage({
        chatId: m.inviteChatId,
        messageId: m.inviteMessageId,
      });
    }
  }

  // Always revoke the invite link on the Telegram side, even when the user
  // had already joined. `member_limit=1` only caps *concurrent* members from
  // a link — once the user leaves or gets kicked, the slot frees up and
  // they can rejoin via the same URL. Revoking is the only way to make the
  // link permanently dead. Idempotent on Telegram.
  if (m.inviteLink) {
    const groupRows = await db
      .select({ chatId: telegramGroups.chatId })
      .from(telegramGroups)
      .where(eq(telegramGroups.id, m.telegramGroupId))
      .limit(1);
    if (groupRows[0]) {
      await revokeInviteLink(groupRows[0].chatId, m.inviteLink);
    }
  }

  // Decide whether to actually kick from the chat. We only kick when no
  // other active membership keeps the user inside the same group.
  const stillActive = await db
    .select({ id: telegramMemberships.id })
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, m.userId),
        eq(telegramMemberships.telegramGroupId, m.telegramGroupId),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    )
    .limit(1);
  if (stillActive.length > 0) return;

  if (!wasJoined) {
    // Never joined — nothing to kick. Push isn't needed either.
    return;
  }

  const userRows = await db
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, m.userId))
    .limit(1);
  const tgId = userRows[0]?.telegramUserId;
  if (!tgId) return;

  const groupRows = await db
    .select()
    .from(telegramGroups)
    .where(eq(telegramGroups.id, m.telegramGroupId))
    .limit(1);
  const group = groupRows[0];
  if (!group) return;

  await kickUser({
    chatId: group.chatId,
    telegramUserId: Number(tgId),
  });

  await pushAccessRevoked(m.userId, group.title);
}

// Full unlink: revoke every active membership for the user (kick if needed),
// then clear the linked Telegram identity. Mobile-initiated unlink + the
// bot's "перепривязка" flow both call this.
export async function revokeAllTelegramAccessForUser(
  userId: string,
): Promise<void> {
  const memberships = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, userId),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    );
  for (const m of memberships) {
    await revokeOneMembership(m);
  }
  await db
    .update(users)
    .set({
      telegramUserId: null,
      telegramUsername: null,
      telegramFirstName: null,
      telegramLinkedAt: null,
    })
    .where(eq(users.id, userId));
}

// ---------- pushes ----------

async function pushAccessGranted(
  userId: string,
  productTitle: string,
  userIsLinked: boolean,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "Доступ открыт",
    body: userIsLinked
      ? `«${productTitle}» — откройте заказ, чтобы войти в Telegram.`
      : `«${productTitle}» — откройте заказ и привяжите Telegram, чтобы войти.`,
    data: {
      type: "telegram_access_granted",
      productTitle,
    },
  }).catch((err) => console.error("[telegram] grant push failed:", err));
}

async function pushAccessRevoked(
  userId: string,
  groupTitle: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "Доступ закрыт",
    body: `Telegram-группа «${groupTitle}» больше недоступна.`,
    data: {
      type: "telegram_access_revoked",
      groupTitle,
    },
  }).catch((err) => console.error("[telegram] revoke push failed:", err));
}
