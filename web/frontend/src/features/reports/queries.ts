import { useQuery } from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  fetchManagerClients,
  fetchManagerDetail,
  fetchManagers,
  fetchNewClientsChart,
  fetchNewClientsSummary,
  fetchSales,
} from "./api";

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useManagersReport(args: {
  from: string;
  to: string;
  q: string;
  sort: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["reports-managers", args] as const,
    queryFn: async () =>
      fetchManagers(await getIdToken(), {
        ...args,
        q: args.q.trim() || null,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useSalesReport(args: {
  from: string;
  to: string;
  sort: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["reports-sales", args] as const,
    queryFn: async () => fetchSales(await getIdToken(), args),
    placeholderData: (prev) => prev,
  });
}

export function useNewClientsSummary() {
  return useQuery({
    queryKey: ["reports-new-clients-summary"] as const,
    queryFn: async () => fetchNewClientsSummary(await getIdToken()),
  });
}

export function useNewClientsChart(from: string, to: string) {
  return useQuery({
    queryKey: ["reports-new-clients-chart", from, to] as const,
    queryFn: async () => fetchNewClientsChart(await getIdToken(), from, to),
    placeholderData: (prev) => prev,
  });
}

export function useManagerDetail(
  id: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ["reports-manager-detail", id, from, to] as const,
    enabled: !!id,
    queryFn: async () => fetchManagerDetail(await getIdToken(), id!, from, to),
  });
}

export function useManagerClients(
  id: string | null,
  args: { from: string; to: string; page: number; pageSize: number },
) {
  return useQuery({
    queryKey: ["reports-manager-clients", id, args] as const,
    enabled: !!id,
    queryFn: async () =>
      fetchManagerClients(await getIdToken(), id!, args),
    placeholderData: (prev) => prev,
  });
}
