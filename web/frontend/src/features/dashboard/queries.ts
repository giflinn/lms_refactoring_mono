import { useQuery } from "@tanstack/react-query";
import { auth } from "../../firebase";
import { fetchSalesChart, fetchSummary, fetchTopProducts } from "./api";

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"] as const,
    queryFn: async () => fetchSummary(await getIdToken()),
  });
}

export function useSalesChart(from: string, to: string) {
  return useQuery({
    queryKey: ["dashboard-sales-chart", from, to] as const,
    queryFn: async () => fetchSalesChart(await getIdToken(), from, to),
    placeholderData: (prev) => prev,
  });
}

export function useTopProducts(from: string, to: string) {
  return useQuery({
    queryKey: ["dashboard-top-products", from, to] as const,
    queryFn: async () => fetchTopProducts(await getIdToken(), from, to),
    placeholderData: (prev) => prev,
  });
}
