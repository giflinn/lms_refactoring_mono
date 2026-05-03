// In-memory presence registry. The map is the source of truth for "is user X
// online" and "what thread is user X currently looking at" — both pieces of
// information that drive smart push routing (only push when offline) and the
// "Активна сейчас" / "был(а) в сети N минут назад" label in the UI.
//
// This is intentionally process-local. The backend runs as a single pm2 fork
// (see root CLAUDE.md), so a Map<userId, ...> is enough. If we ever scale to
// multiple workers we'll need a Redis-backed presence store; the API exposed
// here is small enough to swap out.

import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { chatBus } from "./chatBus";

type Entry = {
  // Set of socket ids currently connected for this user. Online iff non-empty.
  // Multiple sockets exist when the user has the app open on phone + admin
  // panel + tablet, etc.
  sockets: Set<string>;
  // Per-socket active thread (null = no chat focused). When a message is
  // posted to a thread, we walk all of the user's sockets — if any of them
  // is focused on that thread, we treat the user as "actively reading".
  activeThreadBySocket: Map<string, string | null>;
};

const registry = new Map<string, Entry>();

function ensure(userId: string): Entry {
  let entry = registry.get(userId);
  if (!entry) {
    entry = { sockets: new Set(), activeThreadBySocket: new Map() };
    registry.set(userId, entry);
  }
  return entry;
}

export function isOnline(userId: string): boolean {
  return (registry.get(userId)?.sockets.size ?? 0) > 0;
}

export function isFocusedOnThread(
  userId: string,
  threadId: string,
): boolean {
  const entry = registry.get(userId);
  if (!entry) return false;
  for (const tid of entry.activeThreadBySocket.values()) {
    if (tid === threadId) return true;
  }
  return false;
}

export async function attachSocket(
  userId: string,
  socketId: string,
): Promise<{ wasOffline: boolean }> {
  const entry = ensure(userId);
  const wasOffline = entry.sockets.size === 0;
  entry.sockets.add(socketId);
  entry.activeThreadBySocket.set(socketId, null);
  if (wasOffline) {
    chatBus.emit("presence:update", {
      userId,
      online: true,
      lastSeenAt: new Date(),
    });
  }
  return { wasOffline };
}

export async function detachSocket(
  userId: string,
  socketId: string,
): Promise<{ wentOffline: boolean }> {
  const entry = registry.get(userId);
  if (!entry) return { wentOffline: false };
  entry.sockets.delete(socketId);
  entry.activeThreadBySocket.delete(socketId);
  if (entry.sockets.size === 0) {
    registry.delete(userId);
    const lastSeenAt = new Date();
    // Persist last seen so the UI can render "был(а) N минут назад" after
    // the user goes offline. Best-effort — if the DB write fails the in-memory
    // signal already handled the realtime update.
    try {
      await db
        .update(users)
        .set({ lastSeenAt })
        .where(eq(users.id, userId));
    } catch (err) {
      console.error("[chatPresence] failed to persist lastSeenAt:", err);
    }
    chatBus.emit("presence:update", {
      userId,
      online: false,
      lastSeenAt,
    });
    return { wentOffline: true };
  }
  return { wentOffline: false };
}

export function setActiveThread(
  userId: string,
  socketId: string,
  threadId: string | null,
): void {
  const entry = registry.get(userId);
  if (!entry) return;
  if (!entry.sockets.has(socketId)) return;
  entry.activeThreadBySocket.set(socketId, threadId);
}

export function getOnlineUserIds(): string[] {
  return [...registry.keys()];
}
