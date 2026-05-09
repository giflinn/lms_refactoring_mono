import { ApiClient, apiClient } from "../../api/client";

export type FeedbackStatus = "new" | "in_progress" | "resolved";

export type FeedbackUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

export type FeedbackUserSummaryWithPhone = FeedbackUserSummary & {
  phone: string | null;
};

export type FeedbackListItem = {
  id: string;
  status: FeedbackStatus;
  bodySnippet: string;
  createdAt: string;
  client: FeedbackUserSummary;
  manager: FeedbackUserSummary | null;
};

export type FeedbackDetail = {
  id: string;
  status: FeedbackStatus;
  body: string;
  adminNote: string | null;
  clientPlatform: string | null;
  clientAppVersion: string | null;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  client: FeedbackUserSummaryWithPhone;
  manager: FeedbackUserSummary | null;
  readBy: FeedbackUserSummary | null;
  resolvedBy: FeedbackUserSummary | null;
};

export type FeedbackList = {
  feedback: FeedbackListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export class FeedbackApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const code = await ApiClient.parseErrorCode(res.clone());
  throw new FeedbackApiError(code, res.status);
}

export async function listFeedback(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    status?: FeedbackStatus | null;
    clientId?: string | null;
  } = {},
): Promise<FeedbackList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.status) usp.set("status", params.status);
  if (params.clientId) usp.set("clientId", params.clientId);
  const qs = usp.toString();
  const path = qs ? `/feedback?${qs}` : "/feedback";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as FeedbackList;
}

export async function getFeedback(
  idToken: string,
  id: string,
): Promise<FeedbackDetail> {
  const res = await apiClient.get(`/feedback/${id}`, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { feedback: FeedbackDetail };
  return body.feedback;
}

export async function updateFeedback(
  idToken: string,
  id: string,
  payload: {
    status?: FeedbackStatus;
    adminNote?: string | null;
  },
): Promise<void> {
  const res = await apiClient.patchJson(`/feedback/${id}`, payload, idToken);
  await ensureOk(res);
}

export async function getFeedbackUnreadCount(
  idToken: string,
): Promise<number> {
  const res = await apiClient.get("/me/feedback/unread-count", idToken);
  if (!res.ok) return 0;
  const j = (await res.json()) as { count: number };
  return j.count ?? 0;
}
