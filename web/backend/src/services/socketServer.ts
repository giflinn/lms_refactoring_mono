// Socket.IO server: realtime delivery channel that pairs with the REST routes.
//
// Auth handshake — every socket carries a Firebase ID token (header
// "Authorization: Bearer ..." or auth.token from the JS client). We verify it
// once on connect, look up the DB user, and stash actorId/role on the socket.
// From there:
//   - Each socket joins one or more rooms based on its role:
//       client          → thread:<own_thread_id>
//       manager         → all thread:<id> for clients they're assigned to
//       senior_manager  → staff:all (every thread update lands here)
//       admin           → staff:all
//   - Senior/admin sockets additionally join thread:<id> on chat:focus and
//     leave on chat:blur, so they receive low-volume per-thread events
//     (typing, read receipts) only while the thread is open.
//   - chat:focus / chat:blur from any role updates the in-memory presence
//     activeThread map — used to suppress FCM push for messages the user is
//     actively reading and to auto-mark them as read.
//
// On the server side we listen to chatBus events from the REST layer and
// re-emit them into the right rooms. The REST layer doesn't import the
// socket server.

import type { Server as HttpServer } from "node:http";
import { Server as IOServer, Socket } from "socket.io";
import { eq } from "drizzle-orm";
import { firebaseAuth } from "../firebase";
import { db } from "../db";
import { users, chatThreads } from "../db/schema";
import {
  attachSocket,
  detachSocket,
  setActiveThread,
} from "./chatPresence";
import { chatBus } from "./chatBus";

type SocketAuth = {
  actorId: string;
  actorRole: "client" | "manager" | "senior_manager" | "admin";
};

// Typed socket alias — keeps `socket.data.actorId` typed without polluting the
// global Socket type (which would clash with other parts of the module).
type ChatSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  SocketAuth
>;

let ioInstance: IOServer | null = null;

export function getSocketServer(): IOServer | null {
  return ioInstance;
}

function threadRoom(threadId: string): string {
  return `thread:${threadId}`;
}

export function attachSocketServer(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const headerToken = (() => {
        const h = socket.handshake.headers["authorization"];
        if (typeof h === "string" && h.startsWith("Bearer ")) {
          return h.slice("Bearer ".length);
        }
        return null;
      })();
      const authToken = (socket.handshake.auth as { token?: string })?.token;
      const idToken = authToken ?? headerToken;
      if (!idToken) return next(new Error("missing_token"));
      // checkRevoked=true mirrors requireAuth: a deleted user's token is
      // refused immediately instead of riding out the ~1h refresh window.
      const decoded = await firebaseAuth.verifyIdToken(idToken, true);
      const rows = await db
        .select({
          id: users.id,
          role: users.role,
          deactivatedAt: users.deactivatedAt,
        })
        .from(users)
        .where(eq(users.firebaseUid, decoded.uid))
        .limit(1);
      if (rows.length === 0) return next(new Error("user_not_registered"));
      if (rows[0].deactivatedAt) return next(new Error("account_deactivated"));
      socket.data.actorId = rows[0].id;
      socket.data.actorRole = rows[0].role;
      next();
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (
        code === "auth/id-token-revoked" ||
        code === "auth/user-disabled" ||
        code === "auth/user-not-found"
      ) {
        next(new Error("session_revoked"));
        return;
      }
      next(new Error("invalid_token"));
    }
  });

  io.on("connection", async (socket) => {
    const { actorId, actorRole } = socket.data;
    await attachSocket(actorId, socket.id);
    await joinBaseRooms(socket, actorId, actorRole);

    socket.on("chat:focus", (payload: { threadId?: unknown }) => {
      const tid =
        typeof payload?.threadId === "string" ? payload.threadId : null;
      setActiveThread(actorId, socket.id, tid);
      // Senior managers / admins join the specific thread room only while
      // they're actively viewing it — keeps per-thread broadcasts narrow.
      // Clients/managers are already in their relevant thread rooms.
      if (
        tid &&
        (actorRole === "senior_manager" || actorRole === "admin")
      ) {
        socket.join(threadRoom(tid));
      }
    });

    socket.on("chat:blur", () => {
      setActiveThread(actorId, socket.id, null);
      if (actorRole === "senior_manager" || actorRole === "admin") {
        for (const room of socket.rooms) {
          if (room.startsWith("thread:")) socket.leave(room);
        }
      }
    });

    socket.on("disconnect", async () => {
      await detachSocket(actorId, socket.id);
    });
  });

  // Bridge bus events to socket rooms.
  chatBus.on(
    "message:new",
    (event: {
      threadId: string;
      message: unknown;
      recipientUserIds: string[];
      autoReadByUserIds: string[];
      senderId: string;
    }) => {
      io.to(threadRoom(event.threadId)).emit("message:new", {
        threadId: event.threadId,
        message: event.message,
        autoReadByUserIds: event.autoReadByUserIds,
      });
      // Senior managers / admins viewing the chat list see list-level updates
      // even when they aren't joined to this specific thread.
      io.to("staff:all").emit("thread:updated", {
        threadId: event.threadId,
        message: event.message,
      });
    },
  );

  chatBus.on(
    "message:read",
    (event: { threadId: string; userId: string; lastReadAt: Date }) => {
      io.to(threadRoom(event.threadId)).emit("message:read", {
        threadId: event.threadId,
        userId: event.userId,
        lastReadAt: event.lastReadAt.toISOString(),
      });
    },
  );

  chatBus.on(
    "presence:update",
    (event: { userId: string; online: boolean; lastSeenAt: Date }) => {
      // Broadcast to everyone — small payload, easier than maintaining
      // subscriber lists for who-cares-about-whose-presence.
      io.emit("presence:update", {
        userId: event.userId,
        online: event.online,
        lastSeenAt: event.lastSeenAt.toISOString(),
      });
    },
  );

  ioInstance = io;
  return io;
}

async function joinBaseRooms(
  socket: ChatSocket,
  actorId: string,
  actorRole: SocketAuth["actorRole"],
): Promise<void> {
  if (actorRole === "client") {
    const rows = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(eq(chatThreads.clientId, actorId))
      .limit(1);
    if (rows.length > 0) socket.join(threadRoom(rows[0].id));
    return;
  }
  if (actorRole === "manager") {
    const rows = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .innerJoin(users, eq(users.id, chatThreads.clientId))
      .where(eq(users.managerId, actorId));
    for (const r of rows) socket.join(threadRoom(r.id));
    return;
  }
  socket.join("staff:all");
}
