// Bot command + update handlers. Three concerns live here:
//
//   1. /start [<token>] in DM — linking flow.
//        - bare /start: greet + list active grants (with inline buttons)
//        - /start <token>: consume the link token, link the calling Telegram
//          identity to the target app user. Three branches:
//            simple    — no prior link on either side, just connect
//            self-relink — the app user already had a different Telegram;
//                          ask the user to confirm before we kick them from
//                          the previous Telegram's groups
//            other-relink — this Telegram is already linked to a *different*
//                          app account; ask before we steal it (which kicks
//                          the other app user from their groups)
//          Both confirmations are inline keyboards with `relink:<appUserId>`
//          callback data; the actual transition runs in the callback_query
//          handler below.
//
//   2. /register in groups/channels — Stage 1 onboarding flow (kept).
//
//   3. chat_member / my_chat_member — Stage 1 + Stage 3 wiring.
//        - my_chat_member: track bot's own admin status per group.
//        - chat_member: correlate joins/leaves to a telegram_memberships row
//          via invite_link.name = "m:<short>" (8-char membership UUID prefix).
//          Falls back to (user, group) match when the invite link isn't
//          attached (rare, e.g. user was added by a chat admin manually).
//
// Two design notes worth re-reading later:
//   - All replies are best-effort. Telegram may have rate-limited us or the
//     user may have blocked the bot. We log + move on; the next interaction
//     re-attempts.
//   - We never mutate state inside an inline button handler without the
//     `relink:<id>` token re-validating against the current DB. Buttons
//     persist in chat history; users could tap them weeks later.

import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../../db";
import {
  telegramGroups,
  telegramMemberships,
  users,
} from "../../db/schema";
import { sendPushToUser } from "../push";
import {
  describeApiError,
  getBotInfo,
} from "./bot";
import {
  type BotStatus,
  findGroupByChatId,
  probeChat,
  setGroupBotStatus,
  upsertGroup,
} from "./groups";
import { consumeLinkToken } from "./linkTokens";
import {
  ensureInviteLinksForUser,
  revokeAllTelegramAccessForUser,
} from "./grants";

export function registerHandlers(bot: Bot): void {
  bot.command("start", handleStartCommand);
  bot.command("register", handleRegisterCommand);
  bot.command("orders", handleOrdersCommand);
  bot.command("help", handleHelpCommand);
  bot.on("callback_query:data", handleCallbackQuery);
  bot.on("my_chat_member", handleMyChatMember);
  bot.on("chat_member", handleChatMember);
}

// ---------------- /start ----------------

async function handleStartCommand(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== "private") return;
  const from = ctx.from;
  if (!from) return;

  const text = ctx.message?.text ?? "";
  const arg = text.trim().split(/\s+/, 2)[1] ?? null;

  if (!arg) {
    // Bare /start — show inviteable grants for this Telegram if we already
    // know it; otherwise prompt to start linking from the app.
    const linkedUser = await findUserByTelegramId(String(from.id));
    if (!linkedUser) {
      await ctx.reply(
        "Привет! Чтобы получить доступ к купленным Telegram-каналам, " +
          "откройте мобильное приложение и нажмите «Открыть в Telegram» " +
          "в детали активного заказа.",
      );
      return;
    }
    await replyWithUserInvites(ctx, linkedUser.id, linkedUser.firstName);
    return;
  }

  const result = await consumeLinkToken(arg);
  if (!result.ok) {
    const text = {
      not_found: "Ссылка не найдена.",
      expired: "Ссылка устарела — откройте приложение и сгенерируйте новую.",
      already_used:
        "Ссылка уже использована. Если нужна ещё одна — откройте приложение.",
    }[result.reason];
    await ctx.reply(text);
    return;
  }

  await runLinkingFlow(ctx, from.id, from.first_name, from.username, result.userId);
}

async function runLinkingFlow(
  ctx: Context,
  telegramId: number,
  telegramFirstName: string,
  telegramUsername: string | undefined,
  targetAppUserId: string,
): Promise<void> {
  const targetUser = await loadUser(targetAppUserId);
  if (!targetUser) {
    await ctx.reply("Не удалось найти ваш аккаунт. Свяжитесь с менеджером.");
    return;
  }

  const otherAppUser = await findUserByTelegramId(String(telegramId));

  // Case 1 — already linked to this exact account. Friendly no-op.
  if (
    targetUser.telegramUserId &&
    targetUser.telegramUserId === String(telegramId)
  ) {
    await ctx.reply(
      `Уже привязан, ${telegramFirstName || "друг"}! Вот ваши доступы:`,
    );
    await replyWithUserInvites(ctx, targetUser.id, targetUser.firstName);
    return;
  }

  const willKickPreviousTelegram =
    targetUser.telegramUserId !== null &&
    targetUser.telegramUserId !== String(telegramId);
  const willStealFromOther = otherAppUser !== null && otherAppUser.id !== targetUser.id;

  // Case 2 — clean slate, link directly.
  if (!willKickPreviousTelegram && !willStealFromOther) {
    await applyLinking(targetUser.id, telegramId, telegramFirstName, telegramUsername);
    await ctx.reply("✅ Telegram привязан. Сейчас отправлю доступы.");
    await replyWithUserInvites(ctx, targetUser.id, targetUser.firstName);
    return;
  }

  // Cases 3/4/5 — confirmation needed. Encode just the appUserId in the
  // callback so the next click re-evaluates against current state.
  const lines: string[] = [];
  lines.push(`Подтвердите привязку к аккаунту «${displayName(targetUser)}».`);
  if (willKickPreviousTelegram) {
    lines.push(
      "⚠️ К этому аккаунту уже привязан другой Telegram. После подтверждения " +
        "тот пользователь будет удалён из всех связанных групп.",
    );
  }
  if (willStealFromOther) {
    lines.push(
      `⚠️ Этот Telegram уже привязан к другому аккаунту («${displayName(otherAppUser!)}»). ` +
        "После подтверждения тот аккаунт потеряет доступ к группам.",
    );
  }
  const keyboard = new InlineKeyboard()
    .text("Перепривязать", `relink:${targetUser.id}`)
    .text("Отмена", "cancel");
  await ctx.reply(lines.join("\n\n"), { reply_markup: keyboard });
}

async function applyLinking(
  appUserId: string,
  telegramId: number,
  firstName: string,
  username: string | undefined,
): Promise<void> {
  await db
    .update(users)
    .set({
      telegramUserId: String(telegramId),
      telegramFirstName: firstName,
      telegramUsername: username ?? null,
      telegramLinkedAt: new Date(),
    })
    .where(eq(users.id, appUserId));
  await ensureInviteLinksForUser(appUserId);
}

async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const from = ctx.from;
  if (!from) {
    await safeAnswerCallback(ctx);
    return;
  }
  if (data === "cancel") {
    await safeAnswerCallback(ctx, "Отменено");
    await ctx.editMessageText("Отменено.").catch(() => {});
    return;
  }
  if (data.startsWith("relink:")) {
    const targetId = data.slice("relink:".length);
    await handleRelinkCallback(ctx, from.id, from.first_name, from.username, targetId);
    return;
  }
  await safeAnswerCallback(ctx);
}

async function handleRelinkCallback(
  ctx: Context,
  telegramId: number,
  telegramFirstName: string,
  telegramUsername: string | undefined,
  targetAppUserId: string,
): Promise<void> {
  const target = await loadUser(targetAppUserId);
  if (!target) {
    await safeAnswerCallback(ctx, "Аккаунт не найден");
    return;
  }
  // Detach the previous Telegram on the target (if any) — kicks them out of
  // everything granted so far.
  if (
    target.telegramUserId &&
    target.telegramUserId !== String(telegramId)
  ) {
    await revokeAllTelegramAccessForUser(target.id);
  }
  // Detach the new Telegram from any *other* app user (if any) — the same.
  const other = await findUserByTelegramId(String(telegramId));
  if (other && other.id !== target.id) {
    await revokeAllTelegramAccessForUser(other.id);
  }

  await applyLinking(target.id, telegramId, telegramFirstName, telegramUsername);

  await safeAnswerCallback(ctx, "Готово");
  await ctx
    .editMessageText("✅ Telegram перепривязан. Сейчас отправлю доступы.")
    .catch(() => {});
  await replyWithUserInvites(ctx, target.id, target.firstName);
}

// Sends one message per pending/joined membership the user has, with an
// inline button to either open the chat (if they've already joined and we
// know a public username) or claim the invite link.
async function replyWithUserInvites(
  ctx: Context,
  appUserId: string,
  fallbackName: string,
): Promise<void> {
  await ensureInviteLinksForUser(appUserId);
  const memberships = await db
    .select({
      id: telegramMemberships.id,
      status: telegramMemberships.status,
      inviteLink: telegramMemberships.inviteLink,
      group: {
        id: telegramGroups.id,
        title: telegramGroups.title,
        chatType: telegramGroups.chatType,
        inviteUsername: telegramGroups.inviteUsername,
      },
    })
    .from(telegramMemberships)
    .innerJoin(
      telegramGroups,
      eq(telegramGroups.id, telegramMemberships.telegramGroupId),
    )
    .where(
      and(
        eq(telegramMemberships.userId, appUserId),
        // Surface both pending (need to join) and joined (already in chat)
        // so the user has a single place to look.
        like(telegramMemberships.status, "%"), // any string status
      ),
    );
  const active = memberships.filter(
    (m) => m.status === "pending" || m.status === "joined",
  );
  if (active.length === 0) {
    await ctx.reply(
      `Сейчас активных Telegram-доступов нет, ${fallbackName || "друг"}. ` +
        "После покупки нового товара я пришлю ссылку.",
    );
    return;
  }
  for (const m of active) {
    const url =
      m.inviteLink ??
      (m.group.inviteUsername
        ? `https://t.me/${m.group.inviteUsername}`
        : null);
    const lines = [`«${m.group.title}»`];
    if (m.status === "joined") {
      lines.push("Вы уже в чате — кнопка ниже откроет его.");
    } else if (m.inviteLink) {
      lines.push("Нажмите ниже, чтобы войти.");
    } else {
      lines.push(
        "Ссылку ещё готовим. Если через минуту не появится — нажмите /orders.",
      );
    }
    const kb = url ? new InlineKeyboard().url("Открыть", url) : undefined;
    await ctx.reply(lines.join("\n"), { reply_markup: kb });
  }
}

// ---------------- /register ----------------

async function handleRegisterCommand(ctx: Context): Promise<void> {
  const chat = ctx.chat;
  if (!chat) return;
  if (chat.type !== "supergroup" && chat.type !== "channel") {
    await ctx.reply(
      "Эту команду нужно отправлять внутри группы или канала, куда добавлен этот бот.",
    );
    return;
  }
  try {
    const probe = await probeChat(String(chat.id));
    if (probe.status === "chat_not_found") {
      await ctx.reply("Не удалось получить информацию о чате.");
      return;
    }
    const { row, created } = await upsertGroup({
      chatId: String(chat.id),
      probe,
      createdByUserId: null,
    });
    const lines: string[] = [];
    lines.push(
      created
        ? `Группа «${row.title}» зарегистрирована.`
        : `Группа «${row.title}» обновлена.`,
    );
    lines.push(`chat_id: \`${row.chatId}\``);
    lines.push(statusHint(row.botStatus));
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[telegram] /register failed:", describeApiError(err));
    await ctx.reply("Внутренняя ошибка. Попробуйте ещё раз позже.");
  }
}

// ---------------- /orders ----------------

async function handleOrdersCommand(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== "private") return;
  const from = ctx.from;
  if (!from) return;
  const linked = await findUserByTelegramId(String(from.id));
  if (!linked) {
    await ctx.reply(
      "Не вижу привязанного аккаунта. Откройте приложение и нажмите " +
        "«Открыть в Telegram» в активном заказе, чтобы привязать Telegram.",
    );
    return;
  }
  await replyWithUserInvites(ctx, linked.id, linked.firstName);
}

// ---------------- /help ----------------

async function handleHelpCommand(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== "private") return;
  await ctx.reply(
    "Команды:\n" +
      "/start — приветствие или привязка по ссылке из приложения\n" +
      "/orders — список ваших активных Telegram-доступов\n" +
      "/help — это сообщение",
  );
}

// ---------------- chat_member updates ----------------

async function handleMyChatMember(ctx: Context): Promise<void> {
  const update = ctx.myChatMember;
  if (!update) return;
  const chat = update.chat;
  if (chat.type !== "supergroup" && chat.type !== "channel") return;
  const existing = await findGroupByChatId(String(chat.id));
  if (!existing) return; // unknown chat — silent
  const newStatus = inferStatusFromMember(update.new_chat_member);
  await setGroupBotStatus(String(chat.id), newStatus);

  // Notify admins when the bot loses the rights it needs to manage access.
  // Avoids surprise "I bought a channel and it doesn't work" from clients
  // before staff notices in the settings panel.
  const wasOk = existing.botStatus === "admin";
  const isOk = newStatus === "admin";
  if (wasOk && !isOk) {
    notifyAdminsBotDegraded(existing.title, newStatus).catch((err) =>
      console.warn("[telegram] admin notify failed:", err),
    );
  }
}

async function notifyAdminsBotDegraded(
  groupTitle: string,
  status: BotStatus,
): Promise<void> {
  const reason = {
    admin: "повышен до администратора",
    missing_rights: "не хватает прав (Invite Users / Ban Users)",
    not_admin: "лишился прав администратора",
    not_member: "удалён из чата",
    chat_not_found: "чат больше недоступен",
    unknown: "сменил статус",
  }[status];
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.role, "admin"), isNull(users.deactivatedAt)),
    );
  for (const a of admins) {
    await sendPushToUser(a.id, {
      title: "Бот в Telegram-группе требует внимания",
      body: `«${groupTitle}» — бот ${reason}. Откройте Настройки → Telegram.`,
      data: {
        type: "telegram_bot_degraded",
        groupTitle,
        botStatus: status,
      },
    }).catch((err) =>
      console.warn(`[telegram] notify admin ${a.id} failed:`, err),
    );
  }
}

// Other members' join/leave/kick. We only care about users we've linked to
// our own users, and only inside chats we've registered. Both filters keep
// the noise level manageable in chats with broad memberships.
async function handleChatMember(ctx: Context): Promise<void> {
  const update = ctx.chatMember;
  if (!update) return;
  const chat = update.chat;
  if (chat.type !== "supergroup" && chat.type !== "channel") return;
  const group = await findGroupByChatId(String(chat.id));
  if (!group) return;

  const tgUserId = String(update.new_chat_member.user.id);
  const ourUser = await findUserByTelegramId(tgUserId);
  if (!ourUser) return;

  const oldStatus = update.old_chat_member.status;
  const newStatus = update.new_chat_member.status;
  const wasOut = oldStatus === "left" || oldStatus === "kicked";
  const isInChat =
    newStatus === "member" ||
    newStatus === "administrator" ||
    newStatus === "creator" ||
    newStatus === "restricted";
  const isOutNow = newStatus === "left" || newStatus === "kicked";

  // Try to correlate to a specific membership via invite_link.name. Falls
  // back to "the most recent active membership for this user/group" — good
  // enough when an admin invited the user manually.
  let target = await findMembershipByInviteName(
    update.invite_link?.name ?? null,
    ourUser.id,
    group.id,
  );
  if (!target) {
    target = await findActiveMembership(ourUser.id, group.id);
  }

  const now = new Date();

  if (wasOut && isInChat) {
    // Joined.
    if (target) {
      await db
        .update(telegramMemberships)
        .set({ status: "joined", joinedAt: now, updatedAt: now })
        .where(eq(telegramMemberships.id, target.id));
    }
    return;
  }

  if (isOutNow) {
    if (!target) return;
    if (newStatus === "left") {
      // Voluntary leave — keep the order active so the user can re-enter via
      // a fresh invite link generated by the next /orders or by re-tapping
      // CTA in the app.
      await db
        .update(telegramMemberships)
        .set({
          status: "left",
          leftAt: now,
          updatedAt: now,
          inviteLink: null,
          inviteLinkName: null,
        })
        .where(eq(telegramMemberships.id, target.id));
      return;
    }
    // Kicked by an admin in Telegram (not by us — we'd update the row
    // ourselves before issuing banChatMember). Mark + push the user.
    await db
      .update(telegramMemberships)
      .set({
        status: "kicked",
        kickedAt: now,
        updatedAt: now,
        inviteLink: null,
        inviteLinkName: null,
      })
      .where(eq(telegramMemberships.id, target.id));
    // We could push a "Вас удалили из группы" notification here. Skipped for
    // now to avoid a noisy notification when admins clean up house manually.
  }
}

function inferStatusFromMember(member: {
  status: string;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
}): BotStatus {
  switch (member.status) {
    case "creator":
      return "admin";
    case "administrator":
      if (member.can_invite_users && member.can_restrict_members) {
        return "admin";
      }
      return "missing_rights";
    case "member":
    case "restricted":
      return "not_admin";
    case "left":
    case "kicked":
      return "not_member";
    default:
      return "unknown";
  }
}

function statusHint(status: BotStatus): string {
  switch (status) {
    case "admin":
      return "✅ У бота есть все необходимые права (приглашать и ограничивать пользователей).";
    case "missing_rights":
      return (
        "⚠️ Бот — администратор, но не хватает прав. Включите «Пригласительные ссылки» " +
        "и «Блокировка пользователей» в настройках администратора."
      );
    case "not_admin":
      return "⚠️ Бот добавлен в чат, но не назначен администратором. Назначьте администратором с правами Invite + Ban.";
    case "not_member":
      return "⚠️ Бот не состоит в чате. Сначала добавьте его, затем назначьте администратором.";
    case "chat_not_found":
      return "❌ Не удалось прочитать данные чата.";
    default:
      return "Статус: неизвестен.";
  }
}

// ---------------- helpers ----------------

type LoadedUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  telegramUserId: string | null;
};

async function loadUser(id: string): Promise<LoadedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      telegramUserId: users.telegramUserId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function findUserByTelegramId(
  telegramUserId: string,
): Promise<LoadedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      telegramUserId: users.telegramUserId,
    })
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);
  return rows[0] ?? null;
}

function displayName(u: LoadedUser): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email;
}

async function findMembershipByInviteName(
  inviteName: string | null,
  userId: string,
  groupId: string,
) {
  if (!inviteName) return null;
  if (!inviteName.startsWith("m:")) return null;
  const prefix = inviteName.slice(2);
  if (prefix.length === 0) return null;
  // membership.id starts with the 8-char prefix from createPerUserInviteLink.
  const rows = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, userId),
        eq(telegramMemberships.telegramGroupId, groupId),
        like(telegramMemberships.id, `${prefix}%`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findActiveMembership(userId: string, groupId: string) {
  const rows = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        eq(telegramMemberships.userId, userId),
        eq(telegramMemberships.telegramGroupId, groupId),
      ),
    )
    .orderBy(telegramMemberships.createdAt);
  return (
    rows.find((r) => r.status === "pending" || r.status === "joined") ?? null
  );
}

async function safeAnswerCallback(ctx: Context, text?: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text ? { text } : undefined);
  } catch (err) {
    console.warn("[telegram] answerCallbackQuery failed:", describeApiError(err));
  }
}

