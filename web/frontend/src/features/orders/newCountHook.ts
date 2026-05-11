import { useQuery } from "@tanstack/react-query";
import { auth } from "../../firebase";
import { apiClient } from "../../api/client";

const KEY = ["orders", "new-count"] as const;

async function fetchNewCount(): Promise<number> {
  const u = auth.currentUser;
  if (!u) return 0;
  const token = await u.getIdToken();
  const res = await apiClient.get("/orders/new-count", token);
  if (!res.ok) return 0;
  const j = (await res.json()) as { count: number };
  return j.count ?? 0;
}

// Sidebar badge for the "Заказы" item. Polls every 30s while the badge is
// mounted. Counts orders currently in fulfillment_status='new' — freshly
// created orders whose payment hasn't been decided yet.
export function useNewOrdersCount(enabled: boolean): number {
  const q = useQuery<number>({
    queryKey: KEY,
    queryFn: fetchNewCount,
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  return q.data ?? 0;
}
