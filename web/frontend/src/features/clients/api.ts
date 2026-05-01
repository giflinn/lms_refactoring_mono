import { ApiClient, apiClient } from "../../api/client";

export type ClientCategory = "new" | "regular" | "vip";

export type ClientManagerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

export type ClientStatusFilter = "active" | "deactivated" | "all";

export type Client = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  comment: string | null;
  birthDate: string | null;
  clientCategory: ClientCategory;
  managerId: string | null;
  manager: ClientManagerSummary | null;
  deactivatedAt: string | null;
  createdAt: string;
};

export type ClientsList = {
  clients: Client[];
  page: number;
  pageSize: number;
  total: number;
};

export type ClientPatch = {
  phone?: string;
  comment?: string | null;
  birthDate?: string | null;
  clientCategory?: ClientCategory;
  managerId?: string;
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

export async function listClients(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    managerId?: string | null;
    category?: ClientCategory | null;
    status?: ClientStatusFilter;
  } = {},
): Promise<ClientsList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.managerId) usp.set("managerId", params.managerId);
  if (params.category) usp.set("category", params.category);
  if (params.status && params.status !== "active") usp.set("status", params.status);
  const qs = usp.toString();
  const path = qs ? `/clients?${qs}` : "/clients";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as ClientsList;
}

export async function updateClient(
  idToken: string,
  id: string,
  patch: ClientPatch,
): Promise<Client> {
  const res = await apiClient.patchJson(`/clients/${id}`, patch, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { client: Client };
  return body.client;
}

export async function deactivateClient(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/clients/${id}`, idToken);
  await ensureOk(res);
}

export async function reactivateClient(
  idToken: string,
  id: string,
): Promise<Client> {
  const res = await apiClient.postJson(
    `/clients/${id}/reactivate`,
    {},
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { client: Client };
  return body.client;
}
