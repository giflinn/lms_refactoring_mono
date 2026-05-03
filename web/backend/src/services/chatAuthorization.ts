// Authorization rules for chat threads, derived from users.role and the
// thread's client.manager_id. There is no participants table — these helpers
// are the single source of truth for "can user X read/write thread T".
//
// Rules:
//   client          → may read/write only their own thread
//   manager         → may read/write threads where the client's manager_id == self
//   senior_manager  → may read any thread; may write after explicitly joining
//   admin           → may read any thread; may write after explicitly joining
//
// "Joined" status for senior_manager / admin is derived from the existence of
// a kind='system' chat_messages row authored by the actor in the thread
// (idempotent — POST /chat/threads/:id/join inserts at most once).

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { chatMessages, chatThreads, users } from "../db/schema";

export type ActorRole = "client" | "manager" | "senior_manager" | "admin";

export type ThreadAccess = {
  threadId: string;
  clientId: string;
  managerId: string | null;
  role: ActorRole;
  isClient: boolean;
  isAssignedManager: boolean;
  isSeniorOrAdmin: boolean;
  canRead: boolean;
  // canWrite reflects the *current* state — for senior_manager / admin who
  // haven't joined yet, this stays false until they do.
  canWrite: boolean;
  // For senior_manager / admin: have they posted a join system message?
  hasJoined: boolean;
};

export async function loadThreadAccess(
  actorId: string,
  actorRole: ActorRole,
  threadId: string,
): Promise<ThreadAccess | null> {
  const rows = await db
    .select({
      threadId: chatThreads.id,
      clientId: chatThreads.clientId,
      managerId: users.managerId,
    })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.clientId))
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (rows.length === 0) return null;
  const t = rows[0];

  const isClient = actorRole === "client" && t.clientId === actorId;
  const isAssignedManager =
    actorRole === "manager" && t.managerId === actorId;
  const isSeniorOrAdmin =
    actorRole === "senior_manager" || actorRole === "admin";

  const canRead = isClient || isAssignedManager || isSeniorOrAdmin;
  if (!canRead) {
    return {
      threadId: t.threadId,
      clientId: t.clientId,
      managerId: t.managerId,
      role: actorRole,
      isClient: false,
      isAssignedManager: false,
      isSeniorOrAdmin,
      canRead: false,
      canWrite: false,
      hasJoined: false,
    };
  }

  let hasJoined = false;
  if (isSeniorOrAdmin) {
    const join = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadId, threadId),
          eq(chatMessages.senderId, actorId),
          eq(chatMessages.kind, "system"),
        ),
      )
      .limit(1);
    hasJoined = join.length > 0;
  }

  const canWrite =
    isClient || isAssignedManager || (isSeniorOrAdmin && hasJoined);

  return {
    threadId: t.threadId,
    clientId: t.clientId,
    managerId: t.managerId,
    role: actorRole,
    isClient,
    isAssignedManager,
    isSeniorOrAdmin,
    canRead,
    canWrite,
    hasJoined,
  };
}
