import { ApiClient, apiClient } from "../../api/client";

export type ReviewStatus = "pending" | "published" | "deleted";

export type ReviewModerateAction = "publish" | "delete";

export type ReviewUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type ReviewProductSummary = {
  id: string;
  title: string;
};

export type ReviewReply = {
  id: string;
  text: string;
  createdAt: string;
  author: ReviewUserSummary;
};

export type ReviewListItem = {
  id: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  client: ReviewUserSummary;
  product: ReviewProductSummary;
  replies: ReviewReply[];
};

export type ReviewsList = {
  reviews: ReviewListItem[];
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

export async function listReviews(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    status?: ReviewStatus | null;
    clientId?: string | null;
  } = {},
): Promise<ReviewsList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.status) usp.set("status", params.status);
  if (params.clientId) usp.set("clientId", params.clientId);
  const qs = usp.toString();
  const path = qs ? `/reviews?${qs}` : "/reviews";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as ReviewsList;
}

export async function moderateReview(
  idToken: string,
  id: string,
  action: ReviewModerateAction,
): Promise<void> {
  const res = await apiClient.patchJson(`/reviews/${id}`, { action }, idToken);
  await ensureOk(res);
}

export async function replyToReview(
  idToken: string,
  id: string,
  text: string,
): Promise<{ id: string }> {
  const res = await apiClient.postJson(
    `/reviews/${id}/reply`,
    { text },
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { reply: { id: string } };
  return body.reply;
}

export async function deleteReviewReply(
  idToken: string,
  replyId: string,
): Promise<void> {
  const res = await apiClient.delete(
    `/reviews/replies/${replyId}`,
    idToken,
  );
  await ensureOk(res);
}
