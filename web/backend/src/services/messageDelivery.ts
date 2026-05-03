// Inserts a chat message and dispatches it to all interested parties.
// Centralizes:
//   1. DB writes (insert message, denormalize last_message_at/preview)
//   2. Auto-read for recipients currently focused on the thread (so the
//      "опен — без бейджа" UX works without round-tripping through the client)
//   3. Bus emission so the realtime layer (socket.io) and FCM push can react
//
// The push side decides per-recipient whether to actually send a notification
// (only offline users get FCM — see services/pushNotifications.ts which is
// wired up in Phase 4).

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { chatMessages, chatReads, chatThreads, users } from "../db/schema";
import { chatBus } from "./chatBus";
import {
  buildPreview,
  serializeMessage,
  type SerializedMessage,
  type SerializedSender,
} from "./chatRepo";
import { isFocusedOnThread } from "./chatPresence";
import type { StoredAttachment } from "./chatAttachments";
import { encodeAttachments } from "./chatAttachments";

type CreateOptions = {
  threadId: string;
  senderId: string;
  body: string | null;
  attachments: StoredAttachment[];
  kind?: "text" | "system";
  // Recipients of this message — who should be notified. The sender is
  // excluded automatically. For text messages this is typically [client,
  // assignedManager]; for system join messages it's both ends as well.
  recipientUserIds: string[];
};

export type DeliveredMessage = {
  message: SerializedMessage;
  autoReadByUserIds: string[];
};

export async function createAndDeliverMessage(
  opts: CreateOptions,
): Promise<DeliveredMessage> {
  const kind = opts.kind ?? "text";
  const attachmentsJson = encodeAttachments(opts.attachments);
  const preview = buildPreview(opts.body, opts.attachments.length);

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(chatMessages)
      .values({
        threadId: opts.threadId,
        senderId: opts.senderId,
        body: opts.body,
        attachments: attachmentsJson,
        kind,
      })
      .returning();
    await tx
      .update(chatThreads)
      .set({
        lastMessageAt: row.createdAt,
        lastMessagePreview: preview,
      })
      .where(eq(chatThreads.id, opts.threadId));
    // Sender's read marker advances to the message they just sent.
    await tx
      .insert(chatReads)
      .values({
        threadId: opts.threadId,
        userId: opts.senderId,
        lastReadAt: row.createdAt,
      })
      .onConflictDoUpdate({
        target: [chatReads.threadId, chatReads.userId],
        set: { lastReadAt: row.createdAt },
      });
    return row;
  });

  const recipients = opts.recipientUserIds.filter(
    (uid) => uid !== opts.senderId,
  );

  // Recipients currently focused on this thread are auto-marked as read.
  const autoReadByUserIds: string[] = [];
  for (const uid of recipients) {
    if (isFocusedOnThread(uid, opts.threadId)) {
      autoReadByUserIds.push(uid);
    }
  }
  if (autoReadByUserIds.length > 0) {
    await db
      .insert(chatReads)
      .values(
        autoReadByUserIds.map((uid) => ({
          threadId: opts.threadId,
          userId: uid,
          lastReadAt: inserted.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: [chatReads.threadId, chatReads.userId],
        set: { lastReadAt: inserted.createdAt },
      });
  }

  const senderRow = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, opts.senderId))
    .limit(1);
  const sender: SerializedSender | null = senderRow[0]
    ? {
        id: senderRow[0].id,
        firstName: senderRow[0].firstName,
        lastName: senderRow[0].lastName,
        avatarUrl: senderRow[0].avatarUrl,
        role: senderRow[0].role,
      }
    : null;

  const message = serializeMessage(inserted, sender);
  chatBus.emit("message:new", {
    threadId: opts.threadId,
    message,
    recipientUserIds: recipients,
    autoReadByUserIds,
    senderId: opts.senderId,
  });

  return { message, autoReadByUserIds };
}

// Resolves the recipient list for a thread message: client + assigned manager.
// Senior managers/admins are intentionally excluded from push targeting (they
// observe via the admin web socket, not FCM). They still receive the in-app
// socket event because they're joined to the relevant rooms.
export async function resolvePushRecipients(
  threadId: string,
): Promise<{ clientId: string; managerId: string | null }> {
  const rows = await db
    .select({
      clientId: chatThreads.clientId,
      managerId: users.managerId,
    })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.clientId))
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (rows.length === 0) {
    return { clientId: "", managerId: null };
  }
  return rows[0];
}
