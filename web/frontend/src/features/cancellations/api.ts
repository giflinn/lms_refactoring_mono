import { ApiClient, apiClient } from "../../api/client";

export type CancellationStatus = "requested" | "approved" | "rejected";

export type CancellationDecision = "approved" | "rejected";

export type CancellationUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

export type CancellationListItem = {
  id: string;
  orderId: string;
  orderNumber: number;
  status: CancellationStatus;
  createdAt: string;
  decidedAt: string | null;
  client: CancellationUserSummary;
  manager: CancellationUserSummary | null;
};

export type CancellationOrderItem = {
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

export type CancellationDetail = {
  id: string;
  orderId: string;
  orderNumber: number;
  orderTotalTenge: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  status: CancellationStatus;
  clientReason: string | null;
  decisionComment: string | null;
  createdAt: string;
  decidedAt: string | null;
  client: CancellationUserSummary;
  manager: CancellationUserSummary | null;
  decidedBy: CancellationUserSummary | null;
  items: CancellationOrderItem[];
};

export type CancellationsList = {
  cancellations: CancellationListItem[];
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

export async function listCancellations(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    status?: CancellationStatus | null;
    clientId?: string | null;
    managerId?: string | null;
  } = {},
): Promise<CancellationsList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.status) usp.set("status", params.status);
  if (params.clientId) usp.set("clientId", params.clientId);
  if (params.managerId) usp.set("managerId", params.managerId);
  const qs = usp.toString();
  const path = qs ? `/cancellations?${qs}` : "/cancellations";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as CancellationsList;
}

export async function getCancellation(
  idToken: string,
  id: string,
): Promise<CancellationDetail> {
  const res = await apiClient.get(`/cancellations/${id}`, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { cancellation: CancellationDetail };
  return body.cancellation;
}

// For an approved cancellation of a CARD order the backend auto-refunds via
// BCC and reports the outcome here so the UI can show the right message.
export type CancellationRefundOutcome = "refunded" | "failed" | "none";

export async function decideCancellation(
  idToken: string,
  id: string,
  payload: { decision: CancellationDecision; comment: string | null },
): Promise<{ refund: CancellationRefundOutcome }> {
  const res = await apiClient.patchJson(
    `/cancellations/${id}`,
    {
      decision: payload.decision,
      ...(payload.comment ? { comment: payload.comment } : {}),
    },
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { refund?: CancellationRefundOutcome };
  return { refund: body.refund ?? "none" };
}
