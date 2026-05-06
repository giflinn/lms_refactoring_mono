import { apiClient } from "../../api/client";

export type SortDir = "asc" | "desc";

export type ManagerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "manager" | "senior_manager" | "admin";
  clientsCount: number;
  salesTenge: number;
  refundsTenge: number;
};

export type ManagersList = {
  items: ManagerRow[];
  total: number;
};

export type ManagerSortBy = "name" | "clients" | "sales" | "refunds";

export type SalesRow = {
  productId: string;
  productTitle: string;
  categoryName: string;
  salesCount: number;
  salesTenge: number;
  refundsCount: number;
  refundsTenge: number;
};

export type SalesList = {
  items: SalesRow[];
  total: number;
};

export type SalesSortBy =
  | "title"
  | "category"
  | "salesCount"
  | "salesTenge"
  | "refundsCount"
  | "refundsTenge";

export type NewClientsSummary = {
  thisMonth: { value: number; growthPct: number | null };
  prevMonth: { value: number; growthPct: number | null };
  total: number;
};

export type NewClientsChart = {
  bucket: "day" | "week" | "month";
  points: Array<{ start: string; label: string; count: number }>;
};

export type ManagerDetail = {
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    role: "manager" | "senior_manager" | "admin";
  };
  summary: {
    totalClients: number;
    totalSales: { count: number; totalTenge: number };
    totalRefunds: { count: number; totalTenge: number };
  };
  chart: {
    bucket: "day" | "week" | "month";
    points: Array<{ start: string; label: string; incomeTenge: number }>;
  };
};

export type ManagerClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  productsCount: number;
  purchasesTenge: number;
  refundsCount: number;
  refundsTenge: number;
};

export type ManagerClientsList = {
  items: ManagerClientRow[];
  total: number;
};

function qs(params: Record<string, string | number | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function fetchManagers(
  idToken: string,
  args: {
    from: string;
    to: string;
    q: string | null;
    sort: string;
    page: number;
    pageSize: number;
  },
): Promise<ManagersList> {
  const res = await apiClient.get(`/reports/managers${qs(args)}`, idToken);
  if (!res.ok) throw new Error(`GET /reports/managers: ${res.status}`);
  return (await res.json()) as ManagersList;
}

export async function fetchSales(
  idToken: string,
  args: {
    from: string;
    to: string;
    sort: string;
    page: number;
    pageSize: number;
  },
): Promise<SalesList> {
  const res = await apiClient.get(`/reports/sales${qs(args)}`, idToken);
  if (!res.ok) throw new Error(`GET /reports/sales: ${res.status}`);
  return (await res.json()) as SalesList;
}

export async function fetchNewClientsSummary(
  idToken: string,
): Promise<NewClientsSummary> {
  const res = await apiClient.get("/reports/new-clients/summary", idToken);
  if (!res.ok)
    throw new Error(`GET /reports/new-clients/summary: ${res.status}`);
  return (await res.json()) as NewClientsSummary;
}

export async function fetchNewClientsChart(
  idToken: string,
  from: string,
  to: string,
): Promise<NewClientsChart> {
  const res = await apiClient.get(
    `/reports/new-clients/chart${qs({ from, to })}`,
    idToken,
  );
  if (!res.ok) throw new Error(`GET /reports/new-clients/chart: ${res.status}`);
  return (await res.json()) as NewClientsChart;
}

export async function fetchManagerDetail(
  idToken: string,
  id: string,
  from: string,
  to: string,
): Promise<ManagerDetail> {
  const res = await apiClient.get(
    `/reports/managers/${id}${qs({ from, to })}`,
    idToken,
  );
  if (!res.ok) throw new Error(`GET /reports/managers/${id}: ${res.status}`);
  return (await res.json()) as ManagerDetail;
}

export async function fetchManagerClients(
  idToken: string,
  id: string,
  args: { from: string; to: string; page: number; pageSize: number },
): Promise<ManagerClientsList> {
  const res = await apiClient.get(
    `/reports/managers/${id}/clients${qs(args)}`,
    idToken,
  );
  if (!res.ok)
    throw new Error(`GET /reports/managers/${id}/clients: ${res.status}`);
  return (await res.json()) as ManagerClientsList;
}

// CSV download via fetch (so we can attach the bearer token) → blob → anchor
// click. Browsers can't put auth headers on a plain <a>, hence the dance.
export async function downloadCsv(
  idToken: string,
  url: string,
  filename: string,
): Promise<void> {
  const res = await apiClient.get(url, idToken);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
