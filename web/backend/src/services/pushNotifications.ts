// Sends FCM push notifications when a new chat message lands and the
// recipient is offline (or otherwise wouldn't have seen the message via
// socket.io). Hooked into chatBus.message:new from index.ts after the
// socket server is attached, so the REST layer never has to know about
// pushes directly.
//
// Decision matrix (see chat plan in CLAUDE memory):
//   recipient is focused on this thread → no push, server already auto-marked read
//   recipient is online but elsewhere   → no push (in-app socket event fires)
//   recipient is offline                → send push
//
// We also include the unread badge count in the payload so iOS shows the red
// dot on the app icon and Android can render it in launchers that support it.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  chatMessages,
  chatReads,
  chatThreads,
  userFcmTokens,
  users,
} from "../db/schema";
import { firebaseMessaging } from "../firebase";
import { isFocusedOnThread, isOnline } from "./chatPresence";
import { chatBus } from "./chatBus";

type IncomingMessage = {
  threadId: string;
  message: {
    id: string;
    senderId: string;
    body: string | null;
    attachments: { url: string; mime: string; name: string; size: number }[];
    kind: "text" | "system";
  };
  recipientUserIds: string[];
  senderId: string;
};

export function startPushDispatcher(): void {
  chatBus.on("message:new", (event: IncomingMessage) => {
    // Don't await — fire-and-forget so the REST request that triggered the
    // bus event isn't blocked by FCM round-trips. Errors are logged below.
    dispatch(event).catch((err) => {
      console.error("[push] dispatch failed:", err);
    });
  });
}

async function dispatch(event: IncomingMessage): Promise<void> {
  // System messages (joins) — skip push entirely. They're not notifications,
  // they're conversation breadcrumbs.
  if (event.message.kind === "system") return;

  const offlineRecipients = event.recipientUserIds.filter(
    (uid) =>
      uid !== event.senderId &&
      !isOnline(uid) &&
      !isFocusedOnThread(uid, event.threadId),
  );
  if (offlineRecipients.length === 0) return;

  const sender = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, event.senderId))
    .limit(1);
  const senderName =
    sender.length > 0
      ? `${sender[0].firstName} ${sender[0].lastName}`.trim() || "Сообщение"
      : "Сообщение";

  const previewBody = event.message.body
    ? event.message.body
    : event.message.attachments.length === 1
      ? "📎 Вложение"
      : event.message.attachments.length > 1
        ? `📎 ${event.message.attachments.length} вложений`
        : "Новое сообщение";

  for (const userId of offlineRecipients) {
    const tokens = await db
      .select({ token: userFcmTokens.token, platform: userFcmTokens.platform })
      .from(userFcmTokens)
      .where(eq(userFcmTokens.userId, userId));
    if (tokens.length === 0) continue;

    const unreadCount = await unreadFor(userId);
    const dataPayload: Record<string, string> = {
      type: "chat_message",
      threadId: event.threadId,
      messageId: event.message.id,
      unreadCount: String(unreadCount),
    };

    for (const t of tokens) {
      try {
        await firebaseMessaging.send({
          token: t.token,
          notification: {
            title: senderName,
            body: previewBody.length > 200
              ? previewBody.slice(0, 199) + "…"
              : previewBody,
          },
          data: dataPayload,
          apns: {
            payload: { aps: { badge: unreadCount, sound: "default" } },
          },
          android: {
            priority: "high",
            notification: { channelId: "chat" },
          },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          // Token has been revoked / app uninstalled — drop it so we stop
          // wasting calls on it.
          await db
            .delete(userFcmTokens)
            .where(eq(userFcmTokens.token, t.token));
        } else {
          console.error("[push] send failed for token:", code, err);
        }
      }
    }
  }
}

async function unreadFor(userId: string): Promise<number> {
  // Per-user unread across every thread they have a read marker for, plus
  // (for a client) their own thread always counts. Mirrors totalUnreadCount
  // logic in chatRepo but inlined to avoid the role lookup in this hot path.
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(chatMessages)
    .innerJoin(chatThreads, eq(chatThreads.id, chatMessages.threadId))
    .leftJoin(
      chatReads,
      and(
        eq(chatReads.threadId, chatMessages.threadId),
        eq(chatReads.userId, userId),
      ),
    )
    .where(
      and(
        sql`${chatMessages.senderId} <> ${userId}`,
        sql`(${chatReads.lastReadAt} IS NULL OR ${chatMessages.createdAt} > ${chatReads.lastReadAt})`,
        // Either the user owns the thread (client) or has a read marker for
        // it (manager / staff who has visited at least once).
        sql`(${chatThreads.clientId} = ${userId} OR ${chatReads.lastReadAt} IS NOT NULL)`,
      ),
    );
  return rows[0]?.count ?? 0;
}
