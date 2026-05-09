import { useQuery } from "@tanstack/react-query";
import { auth } from "../../firebase";
import { getFeedbackUnreadCount } from "./api";

const KEY = ["feedback", "unread-count"] as const;

async function fetchUnread(): Promise<number> {
  const u = auth.currentUser;
  if (!u) return 0;
  const token = await u.getIdToken();
  return getFeedbackUnreadCount(token);
}

// Sidebar badge for the "Обратная связь" item. Polls every 30s on the
// "/feedback" route (caller passes `enabled` from the sidebar). Mutations
// in queries.ts invalidate this key, so the badge also updates live when a
// staff member opens an item and changes its status.
export function useFeedbackUnreadCount(enabled: boolean): number {
  const q = useQuery<number>({
    queryKey: KEY,
    queryFn: fetchUnread,
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  return q.data ?? 0;
}
