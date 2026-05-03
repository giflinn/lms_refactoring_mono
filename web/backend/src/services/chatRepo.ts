// Data-access helpers for chat threads and messages. Routes are thin and
// delegate the joins/aggregation here. Anything that returns data shaped for
// the API is serialized through `serializeMessage` / `serializeThreadRow` so
// the wire format stays in one place.

import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  chatMessages,
  chatReads,
  chatThreads,
  users,
} from "../db/schema";
import { decodeAttachments } from "./chatAttachments";
import { isOnline } from "./chatPresence";

const MESSAGE_PREVIEW_MAX = 80;

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatThreadRow = typeof chatThreads.$inferSelect;

export type SerializedSender = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: "client" | "manager" | "senior_manager" | "admin";
};

export type SerializedMessage = {
  id: string;
  threadId: string;
  senderId: string;
  sender: SerializedSender | null;
  body: string | null;
  attachments: ReturnType<typeof decodeAttachments>;
  kind: "text" | "system";
  createdAt: string;
};

export function serializeMessage(
  m: ChatMessageRow,
  sender: SerializedSender | null = null,
): SerializedMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    sender,
    body: m.body,
    attachments: decodeAttachments(m.attachments),
    kind: m.kind,
    createdAt: m.createdAt.toISOString(),
  };
}

// Builds the short text preview cached on chat_threads.last_message_preview.
// Body wins; if absent (attachment-only message) we fall back to a localized
// label that lists the attachment count.
export function buildPreview(
  body: string | null,
  attachmentsCount: number,
): string {
  if (body && body.trim()) {
    const trimmed = body.trim();
    return trimmed.length > MESSAGE_PREVIEW_MAX
      ? trimmed.slice(0, MESSAGE_PREVIEW_MAX - 1) + "…"
      : trimmed;
  }
  if (attachmentsCount === 1) return "📎 Вложение";
  if (attachmentsCount > 1) return `📎 ${attachmentsCount} вложений`;
  return "";
}

export async function getOrCreateClientThread(
  clientId: string,
): Promise<ChatThreadRow> {
  const existing = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.clientId, clientId))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const inserted = await db
    .insert(chatThreads)
    .values({ clientId })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return inserted[0];
  // Lost the race; fetch the row that the other writer created.
  const after = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.clientId, clientId))
    .limit(1);
  return after[0];
}

// User snapshot included in thread/message responses. Keeps avatarUrl
// pass-through (relative path; client prepends the API base when rendering).
export type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: "client" | "manager" | "senior_manager" | "admin";
  online?: boolean;
  lastSeenAt?: string | null;
};

export type SerializedThread = {
  id: string;
  client: UserSummary;
  manager: UserSummary | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
};

const managerAlias = alias(users, "managers");

type ListOptions = {
  // null = no role-based filter (senior_manager / admin); otherwise restrict
  // to threads whose client.manager_id equals the actor.
  managerScopeId: string | null;
  search?: string | null;
  filter?: "all" | "unread" | "unanswered";
  managerIdFilter?: string | null;
  sort?: "newest" | "oldest" | "name";
  forUserId: string; // who unreadCount is computed for
};

export async function listThreads(opts: ListOptions): Promise<SerializedThread[]> {
  const conditions = [];
  if (opts.managerScopeId) {
    conditions.push(eq(users.managerId, opts.managerScopeId));
  }
  if (opts.managerIdFilter) {
    conditions.push(eq(users.managerId, opts.managerIdFilter));
  }
  if (opts.search && opts.search.trim()) {
    const like = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        sql`${users.firstName} ILIKE ${like}`,
        sql`${users.lastName} ILIKE ${like}`,
        sql`${users.email} ILIKE ${like}`,
      )!,
    );
  }

  // Per-thread unread count for the calling user — only counts messages from
  // someone other than the actor created after their last_read_at.
  const unreadSql = sql<number>`(
    SELECT COUNT(*)::int FROM ${chatMessages} m
    WHERE m.thread_id = ${chatThreads.id}
      AND m.sender_id <> ${opts.forUserId}
      AND m.created_at > COALESCE(
        (SELECT last_read_at FROM ${chatReads}
         WHERE thread_id = ${chatThreads.id} AND user_id = ${opts.forUserId}),
        '-infinity'::timestamptz
      )
  )`;

  // For "unanswered" filter: last message in the thread was authored by the
  // client (no staff reply yet).
  const lastSenderSql = sql<string | null>`(
    SELECT sender_id::text FROM ${chatMessages}
    WHERE thread_id = ${chatThreads.id}
    ORDER BY created_at DESC LIMIT 1
  )`;

  const baseQuery = db
    .select({
      thread: chatThreads,
      client: users,
      manager: managerAlias,
      unreadCount: unreadSql,
      lastSenderId: lastSenderSql,
    })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.clientId))
    .leftJoin(managerAlias, eq(managerAlias.id, users.managerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const rows = await (() => {
    if (opts.sort === "name") {
      return baseQuery.orderBy(users.firstName, users.lastName);
    }
    if (opts.sort === "oldest") {
      return baseQuery.orderBy(chatThreads.lastMessageAt);
    }
    return baseQuery.orderBy(desc(chatThreads.lastMessageAt));
  })();

  let filtered = rows;
  if (opts.filter === "unread") {
    filtered = filtered.filter((r) => r.unreadCount > 0);
  } else if (opts.filter === "unanswered") {
    filtered = filtered.filter(
      (r) => r.lastSenderId && r.lastSenderId === r.client.id,
    );
  }

  return filtered.map((r) => ({
    id: r.thread.id,
    client: {
      id: r.client.id,
      firstName: r.client.firstName,
      lastName: r.client.lastName,
      avatarUrl: r.client.avatarUrl,
      role: r.client.role,
      online: isOnline(r.client.id),
      lastSeenAt: r.client.lastSeenAt
        ? r.client.lastSeenAt.toISOString()
        : null,
    },
    manager: r.manager
      ? {
          id: r.manager.id,
          firstName: r.manager.firstName,
          lastName: r.manager.lastName,
          avatarUrl: r.manager.avatarUrl,
          role: r.manager.role,
        }
      : null,
    lastMessageAt: r.thread.lastMessageAt
      ? r.thread.lastMessageAt.toISOString()
      : null,
    lastMessagePreview: r.thread.lastMessagePreview,
    unreadCount: r.unreadCount,
    createdAt: r.thread.createdAt.toISOString(),
  }));
}

export async function loadThreadDetail(
  threadId: string,
  forUserId: string,
): Promise<SerializedThread | null> {
  const rows = await db
    .select({
      thread: chatThreads,
      client: users,
      manager: managerAlias,
    })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.clientId))
    .leftJoin(managerAlias, eq(managerAlias.id, users.managerId))
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  const unread = await unreadCountForThread(threadId, forUserId);
  return {
    id: r.thread.id,
    client: {
      id: r.client.id,
      firstName: r.client.firstName,
      lastName: r.client.lastName,
      avatarUrl: r.client.avatarUrl,
      role: r.client.role,
      online: isOnline(r.client.id),
      lastSeenAt: r.client.lastSeenAt
        ? r.client.lastSeenAt.toISOString()
        : null,
    },
    manager: r.manager
      ? {
          id: r.manager.id,
          firstName: r.manager.firstName,
          lastName: r.manager.lastName,
          avatarUrl: r.manager.avatarUrl,
          role: r.manager.role,
          online: isOnline(r.manager.id),
          lastSeenAt: r.manager.lastSeenAt
            ? r.manager.lastSeenAt.toISOString()
            : null,
        }
      : null,
    lastMessageAt: r.thread.lastMessageAt
      ? r.thread.lastMessageAt.toISOString()
      : null,
    lastMessagePreview: r.thread.lastMessagePreview,
    unreadCount: unread,
    createdAt: r.thread.createdAt.toISOString(),
  };
}

export async function unreadCountForThread(
  threadId: string,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(chatMessages)
    .leftJoin(
      chatReads,
      and(
        eq(chatReads.threadId, chatMessages.threadId),
        eq(chatReads.userId, userId),
      ),
    )
    .where(
      and(
        eq(chatMessages.threadId, threadId),
        sql`${chatMessages.senderId} <> ${userId}`,
        or(
          isNull(chatReads.lastReadAt),
          gt(chatMessages.createdAt, chatReads.lastReadAt),
        )!,
      ),
    );
  return rows[0]?.count ?? 0;
}

// Sums unread across all threads accessible to the user. Manager scope only
// includes threads of their own clients; senior_manager/admin see every
// thread (their counter only ticks up if they've joined OR are part of the
// thread, which is captured by chat_reads — a thread they never visited has
// no chat_reads row, so all messages are "after -infinity" and count).
//
// To avoid runaway counters for senior/admins (every message in the system
// would count as unread until they visit the thread), we restrict the sum to
// threads they have a chat_reads row for. Once they open a thread the row is
// created, and from then on the counter behaves as expected.
export async function totalUnreadCount(
  userId: string,
  scope: { managerOf: string | null; isStaffAdmin: boolean },
): Promise<number> {
  if (scope.managerOf) {
    const rows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(chatMessages)
      .innerJoin(chatThreads, eq(chatThreads.id, chatMessages.threadId))
      .innerJoin(users, eq(users.id, chatThreads.clientId))
      .leftJoin(
        chatReads,
        and(
          eq(chatReads.threadId, chatMessages.threadId),
          eq(chatReads.userId, userId),
        ),
      )
      .where(
        and(
          eq(users.managerId, scope.managerOf),
          sql`${chatMessages.senderId} <> ${userId}`,
          or(
            isNull(chatReads.lastReadAt),
            gt(chatMessages.createdAt, chatReads.lastReadAt),
          )!,
        ),
      );
    return rows[0]?.count ?? 0;
  }
  if (scope.isStaffAdmin) {
    // Only count threads they have a read marker for (anchored by the first
    // visit) — see comment above.
    const rows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(chatMessages)
      .innerJoin(
        chatReads,
        and(
          eq(chatReads.threadId, chatMessages.threadId),
          eq(chatReads.userId, userId),
        ),
      )
      .where(
        and(
          sql`${chatMessages.senderId} <> ${userId}`,
          gt(chatMessages.createdAt, chatReads.lastReadAt),
        ),
      );
    return rows[0]?.count ?? 0;
  }
  // Client: own thread only.
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
        eq(chatThreads.clientId, userId),
        sql`${chatMessages.senderId} <> ${userId}`,
        or(
          isNull(chatReads.lastReadAt),
          gt(chatMessages.createdAt, chatReads.lastReadAt),
        )!,
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function fetchMessages(
  threadId: string,
  before: Date | null,
  limit: number,
): Promise<SerializedMessage[]> {
  const cursor = before ? lt(chatMessages.createdAt, before) : undefined;
  const rows = await db
    .select({
      message: chatMessages,
      senderId: users.id,
      senderFirstName: users.firstName,
      senderLastName: users.lastName,
      senderAvatar: users.avatarUrl,
      senderRole: users.role,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(
      cursor
        ? and(eq(chatMessages.threadId, threadId), cursor)
        : eq(chatMessages.threadId, threadId),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows
    .map((r) =>
      serializeMessage(r.message, {
        id: r.senderId,
        firstName: r.senderFirstName,
        lastName: r.senderLastName,
        avatarUrl: r.senderAvatar,
        role: r.senderRole,
      }),
    )
    .reverse();
}
