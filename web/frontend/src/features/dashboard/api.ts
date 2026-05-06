import { apiClient } from "../../api/client";

export type Summary = {
  totalClients: { value: number; growthPct: number | null };
  totalSales: { value: number; growthPct: number | null };
  totalIncome: { valueTenge: number; growthPct: number | null };
  totalManagers: { value: number; growthPct: number | null };
};

export type ChartBucket = "day" | "week" | "month";

export type ChartPoint = {
  start: string;
  label: string;
  incomeTenge: number;
};

export type SalesChart = {
  bucket: ChartBucket;
  points: ChartPoint[];
};

export type TopProduct = {
  productId: string;
  productTitle: string;
  quantity: number;
  incomeTenge: number;
  currentPriceTenge: number | null;
};

export type TopProducts = {
  items: TopProduct[];
};

export async function fetchSummary(idToken: string): Promise<Summary> {
  const res = await apiClient.get("/dashboard/summary", idToken);
  if (!res.ok) throw new Error(`GET /dashboard/summary: ${res.status}`);
  return (await res.json()) as Summary;
}

export async function fetchSalesChart(
  idToken: string,
  from: string,
  to: string,
): Promise<SalesChart> {
  const res = await apiClient.get(
    `/dashboard/sales-chart?from=${from}&to=${to}`,
    idToken,
  );
  if (!res.ok) throw new Error(`GET /dashboard/sales-chart: ${res.status}`);
  return (await res.json()) as SalesChart;
}

export async function fetchTopProducts(
  idToken: string,
  from: string,
  to: string,
): Promise<TopProducts> {
  const res = await apiClient.get(
    `/dashboard/top-products?from=${from}&to=${to}`,
    idToken,
  );
  if (!res.ok) throw new Error(`GET /dashboard/top-products: ${res.status}`);
  return (await res.json()) as TopProducts;
}
