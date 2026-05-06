// Thin wrappers around the Bot API methods we need for invite-link issuance
// and member management. Keeps the grants service focused on business logic
// and contains the "what if the bot isn't ready / Telegram returned an error"
// noise in one place.
//
// All methods are idempotent / safe-on-error: revoke + kick swallow the
// "already revoked" / "user not in chat" Telegram replies because we'd never
// react to them anyway. Real errors propagate so the grant logic can decide
// what to do (usually log + retry on the next status change).

import { describeApiError, getBot } from "./bot";

export type CreatedInviteLink = {
  url: string;
  name: string;
};

// Per-user, single-use invite link. Telegram's createChatInviteLink limits
// `name` to 32 chars — we use "m:<short>" where short is the membership UUID
// truncated to 8 chars so the chat_member callback in Stage 3 can correlate
// the join back to a specific membership row in O(1).
export async function createPerUserInviteLink(params: {
  chatId: string;
  membershipId: string;
  expireDate?: Date;
}): Promise<CreatedInviteLink> {
  const bot = getBot();
  if (!bot) throw new Error("bot_not_configured");
  const name = `m:${params.membershipId.slice(0, 8)}`;
  const result = await bot.api.createChatInviteLink(params.chatId, {
    name,
    member_limit: 1,
    ...(params.expireDate
      ? { expire_date: Math.floor(params.expireDate.getTime() / 1000) }
      : {}),
  });
  return { url: result.invite_link, name };
}

export async function revokeInviteLink(
  chatId: string,
  inviteUrl: string,
): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  try {
    await bot.api.revokeChatInviteLink(chatId, inviteUrl);
  } catch (err) {
    // "INVITE_LINK_REVOKED" / "Bad Request: ..." — already revoked, link
    // belongs to a different chat, etc. Nothing actionable.
    console.warn(
      `[telegram] revokeChatInviteLink failed for ${chatId}: ${describeApiError(err)}`,
    );
  }
}

// "Soft kick" via ban + immediate unban. Removes the user from the chat
// without leaving them banned (so a future re-purchase can re-invite them
// via a fresh link without a manual unban step).
//
// banChatMember requires the user to currently be a member; if they already
// left voluntarily Telegram may return "user not found" — we swallow it.
export async function kickUser(params: {
  chatId: string;
  telegramUserId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const bot = getBot();
  if (!bot) return { ok: false, error: "bot_not_configured" };
  try {
    await bot.api.banChatMember(params.chatId, params.telegramUserId);
  } catch (err) {
    const msg = describeApiError(err);
    // user not present is fine — same end state as kick succeeded.
    if (
      /user not found/i.test(msg) ||
      /participant_id_invalid/i.test(msg) ||
      /USER_NOT_PARTICIPANT/i.test(msg)
    ) {
      return { ok: true };
    }
    console.warn(`[telegram] banChatMember failed for ${params.chatId}: ${msg}`);
    return { ok: false, error: msg };
  }
  // Unban so the user isn't blocked from re-joining via a future invite link
  // (ban → unban is the standard "soft kick" pattern in the Bot API).
  try {
    await bot.api.unbanChatMember(params.chatId, params.telegramUserId, {
      only_if_banned: true,
    });
  } catch (err) {
    console.warn(
      `[telegram] unbanChatMember failed for ${params.chatId}: ${describeApiError(err)}`,
    );
  }
  return { ok: true };
}
