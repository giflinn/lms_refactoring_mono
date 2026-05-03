// Singleton socket.io client wired to the backend's /socket.io endpoint.
// Lazily created the first time something subscribes so we don't connect for
// users who never open the chat page. Reconnects through the same instance —
// socket.io handles backoff internally.
//
// Subscribers are React hooks (useChatSocket) — when the first subscriber
// mounts we connect, when the last unmounts we disconnect.

import { io, type Socket } from "socket.io-client";
import { useEffect, useRef } from "react";
import { auth } from "../../firebase";

const baseUrl = import.meta.env.VITE_API_URL;

let socket: Socket | null = null;
let refCount = 0;
// Cached token so we can attach it without an async hop on each reconnect.
// Updated in useChatSocket on mount and when Firebase rotates the token.

function ensureSocket(idToken: string): Socket {
  if (socket) {
    socket.auth = { token: idToken };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(baseUrl, {
    path: "/socket.io",
    autoConnect: false,
    auth: { token: idToken },
    transports: ["websocket", "polling"],
  });
  socket.connect();
  return socket;
}

export type ChatSocketEvents = {
  "message:new": (e: {
    threadId: string;
    message: import("./types").ChatMessage;
    autoReadByUserIds: string[];
  }) => void;
  "thread:updated": (e: {
    threadId: string;
    message: import("./types").ChatMessage;
  }) => void;
  "message:read": (e: {
    threadId: string;
    userId: string;
    lastReadAt: string;
  }) => void;
  "presence:update": (e: {
    userId: string;
    online: boolean;
    lastSeenAt: string;
  }) => void;
};

export function useChatSocket(
  handlers: Partial<ChatSocketEvents>,
  // Active thread for chat:focus / chat:blur — server uses this to suppress
  // push and auto-mark messages read while the user is on this thread.
  activeThreadId: string | null,
): Socket | null {
  const ref = useRef<Socket | null>(null);
  // Stash handlers in a ref so the connect/disconnect effect below doesn't
  // reattach listeners every render (which would force re-subscribe storms).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let cancelled = false;
    let s: Socket | null = null;
    (async () => {
      const u = auth.currentUser;
      if (!u) return;
      const idToken = await u.getIdToken();
      if (cancelled) return;
      s = ensureSocket(idToken);
      ref.current = s;
      refCount++;

      const dispatch = (event: keyof ChatSocketEvents, payload: unknown) => {
        const fn = handlersRef.current[event];
        if (fn) (fn as (p: unknown) => void)(payload);
      };
      const onMessageNew = (p: unknown) => dispatch("message:new", p);
      const onThreadUpdated = (p: unknown) => dispatch("thread:updated", p);
      const onMessageRead = (p: unknown) => dispatch("message:read", p);
      const onPresence = (p: unknown) => dispatch("presence:update", p);

      s.on("message:new", onMessageNew);
      s.on("thread:updated", onThreadUpdated);
      s.on("message:read", onMessageRead);
      s.on("presence:update", onPresence);

      s.cleanup = () => {
        s!.off("message:new", onMessageNew);
        s!.off("thread:updated", onThreadUpdated);
        s!.off("message:read", onMessageRead);
        s!.off("presence:update", onPresence);
      };
    })();

    return () => {
      cancelled = true;
      if (s) {
        (s as Socket & { cleanup?: () => void }).cleanup?.();
        refCount--;
        if (refCount <= 0) {
          s.disconnect();
          socket = null;
          refCount = 0;
        }
      }
    };
  }, []);

  // Emit chat:focus / chat:blur as the active thread changes.
  useEffect(() => {
    const s = ref.current;
    if (!s) return;
    if (activeThreadId) {
      s.emit("chat:focus", { threadId: activeThreadId });
      return () => {
        s.emit("chat:blur");
      };
    } else {
      s.emit("chat:blur");
    }
  }, [activeThreadId]);

  return ref.current;
}

// Augment the Socket type so we can stash a per-instance cleanup function
// without TypeScript complaining.
declare module "socket.io-client" {
  interface Socket {
    cleanup?: () => void;
  }
}
