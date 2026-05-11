import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "../../firebase";
import { apiClient } from "../../api/client";
import { useChatSocket } from "./socket";

const KEY = ["chat", "unread-threads-count"] as const;

async function fetchUnread(): Promise<number> {
  const u = auth.currentUser;
  if (!u) return 0;
  const token = await u.getIdToken();
  // Web admin badge reads "how many chats need attention" — distinct threads
  // with unread messages, not the total message count (which mobile still
  // uses via /chat/unread-count).
  const res = await apiClient.get("/chat/unread-threads-count", token);
  if (!res.ok) return 0;
  const j = (await res.json()) as { count: number };
  return j.count ?? 0;
}

// Live-updating unread counter for the sidebar badge. We invalidate on any
// chat:* socket event so the count tracks in close to real time without us
// having to compute deltas client-side.
export function useUnreadCount(enabled: boolean): number {
  const [, setBump] = useState(0);
  const qc = useQueryClient();
  const q = useQuery<number>({
    queryKey: KEY,
    queryFn: fetchUnread,
    enabled,
    staleTime: 30_000,
  });

  useChatSocket(
    {
      "message:new": () => {
        qc.invalidateQueries({ queryKey: KEY });
      },
      "message:read": () => {
        qc.invalidateQueries({ queryKey: KEY });
      },
      "thread:updated": () => {
        qc.invalidateQueries({ queryKey: KEY });
      },
    },
    null,
  );

  useEffect(() => {
    // Force re-render when query data lands.
    setBump((x) => x + 1);
  }, [q.data]);

  return q.data ?? 0;
}
