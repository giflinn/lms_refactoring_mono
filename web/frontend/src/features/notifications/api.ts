import { ApiClient, apiClient } from "../../api/client";

export type ClientCategory = "vip" | "new" | "regular";
export type RecurrenceUnit = "week" | "month" | "year";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type NotificationStatus = "active" | "completed" | "cancelled";

export type Notification = {
  id: string;
  title: string;
  body: string;
  category: ClientCategory | null;
  scheduledAt: string | null;
  recurrenceUnit: RecurrenceUnit | null;
  recurrenceInterval: number | null;
  recurrenceByweekday: Weekday[] | null;
  startsAt: string | null;
  endsAt: string | null;
  nextFireAt: string | null;
  status: NotificationStatus;
  isRecurring: boolean;
  createdAt: string;
};

// Submit shape — server normalises and infers status / nextFireAt.
export type NotificationInput = {
  title: string;
  body: string;
  category: ClientCategory | null;
  sendNow: boolean;
  // ISO 8601. Required for one-shot if sendNow=false.
  scheduledAt: string | null;
  recurring: boolean;
  // Required when recurring=true.
  startsAt: string | null;
  endsAt: string | null;
  recurrenceUnit: RecurrenceUnit | null;
  recurrenceInterval: number | null;
  // Only meaningful when recurrenceUnit='week'.
  recurrenceByweekday: Weekday[] | null;
};

export class ApiError extends Error {
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
  const code = await ApiClient.parseErrorCode(res);
  throw new ApiError(code, res.status);
}

export async function listNotifications(
  idToken: string,
  params: { status: "active" | "completed"; category?: ClientCategory | "all" },
): Promise<Notification[]> {
  const usp = new URLSearchParams();
  usp.set("status", params.status);
  if (params.category) usp.set("category", params.category);
  const res = await apiClient.get(`/notifications?${usp.toString()}`, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { notifications: Notification[] };
  return body.notifications;
}

export async function createNotification(
  idToken: string,
  input: NotificationInput,
): Promise<Notification> {
  const res = await apiClient.postJson("/notifications", input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { notification: Notification };
  return body.notification;
}

export async function updateNotification(
  idToken: string,
  id: string,
  input: NotificationInput,
): Promise<Notification> {
  const res = await apiClient.patchJson(`/notifications/${id}`, input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { notification: Notification };
  return body.notification;
}

export async function deleteNotification(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/notifications/${id}`, idToken);
  await ensureOk(res);
}
