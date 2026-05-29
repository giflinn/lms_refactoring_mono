import { apiClient } from "../../../api/client";

// Admin-only BCC audit views. Mirrors web/backend/src/routes/bccAdmin.ts.

export type BccTxnListItem = {
  id: string;
  bccOrder: number;
  status: string; // pending | paid | failed | refunded
  amountTenge: string;
  rc: string | null;
  rcText: string | null;
  cardMask: string | null;
  createdAt: string;
  updatedAt: string;
  orderId: string | null;
  orderNumber: number | null;
  orderPaymentStatus: string | null;
};

export type BccTxnDetail = BccTxnListItem & {
  provider: string;
  action: string | null;
  rrn: string | null;
  intRef: string | null;
  rawRequest: Record<string, string> | null;
  rawCallback: Record<string, string> | null;
};

export type BccEvent = {
  id: string;
  createdAt: string;
  kind: string; // purchase_form | callback | refund
  trtype: string | null;
  outcome: string; // pending | success | declined | error | unverified
  action: string | null;
  rc: string | null;
  rcText: string | null;
  httpStatus: number | null;
  note: string | null;
  payload: Record<string, string> | null;
  bccOrder: number | null;
  paymentTransactionId: string | null;
  orderId: string | null;
  orderNumber: number | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function getBccTransactions(
  token: string,
  params: { status?: string; orderNumber?: number; page?: number },
): Promise<Paginated<BccTxnListItem>> {
  const res = await apiClient.get(`/admin/bcc/transactions${qs(params)}`, token);
  if (!res.ok) throw new Error(`GET /admin/bcc/transactions: ${res.status}`);
  return (await res.json()) as Paginated<BccTxnListItem>;
}

export async function getBccTransaction(
  token: string,
  id: string,
): Promise<{ transaction: BccTxnDetail; events: BccEvent[] }> {
  const res = await apiClient.get(`/admin/bcc/transactions/${id}`, token);
  if (!res.ok) throw new Error(`GET /admin/bcc/transactions/${id}: ${res.status}`);
  return (await res.json()) as {
    transaction: BccTxnDetail;
    events: BccEvent[];
  };
}

export async function getBccEvents(
  token: string,
  params: {
    kind?: string;
    outcome?: string;
    orderNumber?: number;
    page?: number;
  },
): Promise<Paginated<BccEvent>> {
  const res = await apiClient.get(`/admin/bcc/events${qs(params)}`, token);
  if (!res.ok) throw new Error(`GET /admin/bcc/events: ${res.status}`);
  return (await res.json()) as Paginated<BccEvent>;
}
