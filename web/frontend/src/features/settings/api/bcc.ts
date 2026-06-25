import { apiClient, ApiClient } from "../../../api/client";

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

// ---- credentials (Реквизиты) — GET/PUT /admin/bcc/settings ----------------

// Masked view of the active credentials. Secrets are never returned: the MAC
// key is shown only as a configured flag + fingerprint, the callback password
// as a "••••" mask.
export type BccSettings = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  macKeyConfigured: boolean;
  macKeyFingerprint: string | null;
  notifyPassMasked: string;
  callbackAuthEnabled: boolean;
  source: "db" | "env" | "none";
  mode: "test" | "prod" | "unknown";
  encryptionConfigured: boolean;
};

// MAC key + callback password are write-only: omit/blank to keep the current
// value. The MAC key may be sent as two components (XOR-assembled server-side)
// or as a pre-assembled hex key.
export type BccSettingsPayload = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  macKey?: string;
  macKeyComponentA?: string;
  macKeyComponentB?: string;
  notifyPass?: string;
};

export class BccSettingsError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function getBccSettings(token: string): Promise<BccSettings> {
  const res = await apiClient.get("/admin/bcc/settings", token);
  if (!res.ok) throw new Error(`GET /admin/bcc/settings: ${res.status}`);
  return (await res.json()) as BccSettings;
}

export async function saveBccSettings(
  token: string,
  payload: BccSettingsPayload,
): Promise<BccSettings> {
  const res = await apiClient.put("/admin/bcc/settings", payload, token);
  if (!res.ok) {
    const code = await ApiClient.parseErrorCode(res.clone());
    throw new BccSettingsError(code, res.status);
  }
  return (await res.json()) as BccSettings;
}
