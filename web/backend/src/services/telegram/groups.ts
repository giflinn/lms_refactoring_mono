// Helpers for the telegram_groups table — chat metadata sync, bot-status
// inference, and the centralised insert path used by both the /register
// in-chat flow and the manual chat_id form in the admin UI.
//
// Bot status mapping (single source of truth so UI + admin checks agree):
//   admin           bot is admin in chat AND has can_invite_users +
//                   can_restrict_members. The only state that allows new
//                   memberships to be granted from this group.
//   missing_rights  bot is admin but missing one of the required toggles.
//   not_admin       bot is in chat but not admin (member only).
//   not_member      bot was kicked / removed.
//   chat_not_found  Telegram returned chat_not_found (deleted/inaccessible).
//   unknown         we never managed to query getChat for this row.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { telegramGroups } from "../../db/schema";
import { describeApiError, getBot, getBotInfo } from "./bot";

export type BotStatus =
  | "admin"
  | "missing_rights"
  | "not_admin"
  | "not_member"
  | "chat_not_found"
  | "unknown";

export type ChatProbe = {
  status: BotStatus;
  // Populated when status ∈ {admin, missing_rights, not_admin}. Used to
  // initialise / refresh telegram_groups.title and chat_type.
  title?: string;
  chatType?: "channel" | "supergroup";
  inviteUsername?: string | null;
  description?: string | null;
};

// Calls getChat + getChatMember(bot.id) and folds the result into a uniform
// ChatProbe. Doesn't write to the DB — callers persist the outcome.
export async function probeChat(chatId: string): Promise<ChatProbe> {
  const bot = getBot();
  const info = getBotInfo();
  if (!bot || !info) {
    return { status: "unknown" };
  }
  let chat;
  try {
    chat = await bot.api.getChat(chatId);
  } catch (err) {
    const msg = describeApiError(err);
    if (/chat not found/i.test(msg) || /chat_not_found/i.test(msg)) {
      return { status: "chat_not_found" };
    }
    if (/forbidden/i.test(msg) || /bot is not a member/i.test(msg)) {
      return { status: "not_member" };
    }
    throw err;
  }

  // We only support supergroups and channels. Regular groups (type=group)
  // are legacy and lack the bot-admin features we need; private/direct
  // chats with a person are obviously wrong.
  if (chat.type !== "supergroup" && chat.type !== "channel") {
    return { status: "chat_not_found" };
  }

  const meta: Pick<ChatProbe, "title" | "chatType" | "inviteUsername" | "description"> = {
    title: chat.title,
    chatType: chat.type,
    inviteUsername: chat.username ?? null,
    description: ("description" in chat ? chat.description : null) ?? null,
  };

  let member;
  try {
    member = await bot.api.getChatMember(chatId, info.id);
  } catch (err) {
    const msg = describeApiError(err);
    if (/forbidden/i.test(msg) || /bot is not a member/i.test(msg)) {
      return { status: "not_member", ...meta };
    }
    throw err;
  }

  if (member.status === "left" || member.status === "kicked") {
    return { status: "not_member", ...meta };
  }
  if (member.status === "member") {
    return { status: "not_admin", ...meta };
  }
  if (member.status === "administrator" || member.status === "creator") {
    // Creator status (rare for bots — only happens if the bot CREATED the
    // chat which it can't, but grammY types include it) implies all rights.
    if (member.status === "creator") {
      return { status: "admin", ...meta };
    }
    const canInvite = member.can_invite_users === true;
    const canRestrict = member.can_restrict_members === true;
    if (canInvite && canRestrict) {
      return { status: "admin", ...meta };
    }
    return { status: "missing_rights", ...meta };
  }
  return { status: "unknown", ...meta };
}

// Find or create a telegram_groups row for a chat we just discovered.
// Returns { row, created } so callers can react differently (e.g. /register
// posting "Группа добавлена" vs "Уже зарегистрирована"). Used by both the
// /register in-chat command and the manual chat_id admin form.
export async function upsertGroup(params: {
  chatId: string;
  probe: ChatProbe;
  createdByUserId: string | null;
}): Promise<{
  row: typeof telegramGroups.$inferSelect;
  created: boolean;
}> {
  const { chatId, probe, createdByUserId } = params;
  const existing = await db
    .select()
    .from(telegramGroups)
    .where(eq(telegramGroups.chatId, chatId))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const updated = await db
      .update(telegramGroups)
      .set({
        title: probe.title ?? row.title,
        chatType: probe.chatType ?? row.chatType,
        inviteUsername:
          probe.inviteUsername === undefined
            ? row.inviteUsername
            : probe.inviteUsername,
        description:
          probe.description === undefined ? row.description : probe.description,
        botStatus: probe.status,
        botStatusCheckedAt: new Date(),
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(telegramGroups.id, row.id))
      .returning();
    return { row: updated[0], created: false };
  }

  if (!probe.title || !probe.chatType) {
    // Defensive: we only create rows once we've successfully read getChat —
    // the row must have a title + chat_type so the admin UI can render it.
    throw new Error("group_metadata_missing");
  }

  const created = await db
    .insert(telegramGroups)
    .values({
      chatId,
      title: probe.title,
      chatType: probe.chatType,
      inviteUsername: probe.inviteUsername ?? null,
      description: probe.description ?? null,
      botStatus: probe.status,
      botStatusCheckedAt: new Date(),
      createdByUserId,
    })
    .returning();
  return { row: created[0], created: true };
}

export async function findGroupByChatId(
  chatId: string,
): Promise<typeof telegramGroups.$inferSelect | null> {
  const rows = await db
    .select()
    .from(telegramGroups)
    .where(eq(telegramGroups.chatId, chatId))
    .limit(1);
  return rows[0] ?? null;
}

// Lightweight status-only refresh — used after we observe my_chat_member
// updates without bothering with a full getChat round-trip.
export async function setGroupBotStatus(
  chatId: string,
  status: BotStatus,
): Promise<void> {
  await db
    .update(telegramGroups)
    .set({
      botStatus: status,
      botStatusCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(telegramGroups.chatId, chatId));
}

export async function listGroups(opts: {
  includeArchived?: boolean;
}): Promise<(typeof telegramGroups.$inferSelect)[]> {
  if (opts.includeArchived) {
    return db.select().from(telegramGroups).orderBy(telegramGroups.createdAt);
  }
  return db
    .select()
    .from(telegramGroups)
    .where(isNull(telegramGroups.archivedAt))
    .orderBy(telegramGroups.createdAt);
}

export async function listActiveGroups(): Promise<
  (typeof telegramGroups.$inferSelect)[]
> {
  return db
    .select()
    .from(telegramGroups)
    .where(
      and(
        isNull(telegramGroups.archivedAt),
        // Only groups where the bot is a fully-permissioned admin can be
        // attached to new products / generate invite links.
        eq(telegramGroups.botStatus, "admin"),
      ),
    )
    .orderBy(telegramGroups.title);
}
