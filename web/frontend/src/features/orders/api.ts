import { ApiClient, apiClient } from "../../api/client";

export type PaymentStatus = "pending" | "paid" | "unpaid" | "refunded";
export type FulfillmentStatus =
  | "new"
  | "active"
  | "completed"
  | "cancelled";

export type OrderUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

export type OrderListItem = {
  id: string;
  orderNumber: number;
  paymentStatus: PaymentStatus;
  paymentMethod: "kaspi" | "card" | null;
  fulfillmentStatus: FulfillmentStatus;
  // Postgres numeric arrives as a JSON string ("10000.00"); render with
  // formatTenge (see ./format.ts).
  totalTenge: string;
  itemsCount: number;
  createdAt: string;
  firstPaidAt: string | null;
  statusChangedAt: string;
  client: OrderUserSummary;
  manager: OrderUserSummary | null;
};

export type OrderItem = {
  id: string;
  productId: string;
  productTitle: string;
  productCategoryName: string;
  productSubtitle: string | null;
  unitPriceTenge: string;
  quantity: number;
  bookedStart: string | null;
  bookedEnd: string | null;
  expiresAt: string | null;
};

export type OrderDetail = {
  id: string;
  orderNumber: number;
  paymentStatus: PaymentStatus;
  // null on legacy/Kaspi orders (UI treats null as Kaspi); "card" once a BCC
  // card payment was initiated.
  paymentMethod: "kaspi" | "card" | null;
  // Latest card-payment attempt summary (null if there was none).
  payment: {
    status: string;
    cardMask: string | null;
    rc: string | null;
    rcText: string | null;
    rrn: string | null;
  } | null;
  fulfillmentStatus: FulfillmentStatus;
  totalTenge: string;
  createdAt: string;
  firstPaidAt: string | null;
  statusChangedAt: string;
  client: OrderUserSummary;
  manager: OrderUserSummary | null;
  items: OrderItem[];
};

export type OrdersList = {
  orders: OrderListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, status: number, details?: unknown) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const code = await ApiClient.parseErrorCode(res.clone());
  let details: unknown = undefined;
  try {
    const body = (await res.json()) as { details?: unknown };
    details = body.details;
  } catch {
    /* body already consumed or not json */
  }
  throw new ApiError(code, res.status, details);
}

export async function listOrders(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    clientId?: string | null;
    managerId?: string | null;
    paymentStatus?: PaymentStatus | null;
    fulfillmentStatus?: FulfillmentStatus | null;
  } = {},
): Promise<OrdersList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.clientId) usp.set("clientId", params.clientId);
  if (params.managerId) usp.set("managerId", params.managerId);
  if (params.paymentStatus) usp.set("paymentStatus", params.paymentStatus);
  if (params.fulfillmentStatus)
    usp.set("fulfillmentStatus", params.fulfillmentStatus);
  const qs = usp.toString();
  const path = qs ? `/orders?${qs}` : "/orders";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as OrdersList;
}

export async function getOrder(
  idToken: string,
  id: string,
): Promise<OrderDetail> {
  const res = await apiClient.get(`/orders/${id}`, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { order: OrderDetail };
  return body.order;
}

export async function patchOrder(
  idToken: string,
  id: string,
  patch: {
    paymentStatus?: PaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    force?: boolean;
  },
): Promise<OrderListItem> {
  const res = await apiClient.patchJson(`/orders/${id}`, patch, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { order: OrderListItem };
  return body.order;
}
