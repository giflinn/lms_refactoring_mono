import { apiClient } from "../../api/client";
import type {
  ChatMessage,
  ChatThread,
  ChatThreadAccess,
} from "./types";

export type ListThreadsParams = {
  search?: string;
  filter?: "all" | "unread" | "unanswered";
  managerId?: string | null;
  sort?: "newest" | "oldest" | "name";
};

export async function listThreads(
  idToken: string,
  params: ListThreadsParams,
): Promise<ChatThread[]> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.filter && params.filter !== "all") qs.set("filter", params.filter);
  if (params.managerId) qs.set("managerId", params.managerId);
  if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
  const path = `/chat/threads${qs.toString() ? "?" + qs.toString() : ""}`;
  const res = await apiClient.get(path, idToken);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return ((await res.json()) as { threads: ChatThread[] }).threads;
}

export async function getThread(
  idToken: string,
  threadId: string,
): Promise<{ thread: ChatThread; access: ChatThreadAccess }> {
  const res = await apiClient.get(`/chat/threads/${threadId}`, idToken);
  if (!res.ok) throw new Error(`GET /chat/threads/${threadId}: ${res.status}`);
  return (await res.json()) as { thread: ChatThread; access: ChatThreadAccess };
}

export async function listMessages(
  idToken: string,
  threadId: string,
  options: { before?: string | null; limit?: number } = {},
): Promise<ChatMessage[]> {
  const qs = new URLSearchParams();
  if (options.before) qs.set("before", options.before);
  if (options.limit) qs.set("limit", String(options.limit));
  const path = `/chat/threads/${threadId}/messages${
    qs.toString() ? "?" + qs.toString() : ""
  }`;
  const res = await apiClient.get(path, idToken);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return ((await res.json()) as { messages: ChatMessage[] }).messages;
}

export async function sendMessage(
  idToken: string,
  threadId: string,
  body: string,
  files: File[],
): Promise<ChatMessage> {
  const fd = new FormData();
  if (body) fd.append("body", body);
  for (const f of files) fd.append("files", f);
  const res = await apiClient.postFormData(
    `/chat/threads/${threadId}/messages`,
    fd,
    idToken,
  );
  if (!res.ok) {
    const code = await tryReadCode(res);
    throw new Error(code ?? `POST messages: ${res.status}`);
  }
  return ((await res.json()) as { message: ChatMessage }).message;
}

export async function markRead(
  idToken: string,
  threadId: string,
): Promise<void> {
  const res = await apiClient.postJson(
    `/chat/threads/${threadId}/read`,
    {},
    idToken,
  );
  if (!res.ok) throw new Error(`POST read: ${res.status}`);
}

export async function joinThread(
  idToken: string,
  threadId: string,
): Promise<void> {
  const res = await apiClient.postJson(
    `/chat/threads/${threadId}/join`,
    {},
    idToken,
  );
  if (!res.ok) throw new Error(`POST join: ${res.status}`);
}

async function tryReadCode(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? null;
  } catch {
    return null;
  }
}
