import { ApiClient, apiClient } from "../../api/client";
import type { Role } from "../../auth/api";

export type ManagerStatusFilter = "active" | "deactivated" | "all";

export type Manager = {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  comment: string | null;
  managerCode: string | null;
  avatarUrl: string | null;
  deactivatedAt: string | null;
  createdAt: string;
};

export type ManagersList = {
  managers: Manager[];
  page: number;
  pageSize: number;
  total: number;
};

export type ManagerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  comment?: string | null;
  isSenior: boolean;
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

export async function listManagers(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    status?: ManagerStatusFilter;
  } = {},
): Promise<ManagersList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.status && params.status !== "active") usp.set("status", params.status);
  const qs = usp.toString();
  const path = qs ? `/managers?${qs}` : "/managers";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as ManagersList;
}

export async function createManager(
  idToken: string,
  input: ManagerInput,
): Promise<Manager> {
  const res = await apiClient.postJson("/managers", input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { manager: Manager };
  return body.manager;
}

export async function updateManager(
  idToken: string,
  id: string,
  patch: Partial<ManagerInput>,
): Promise<Manager> {
  const res = await apiClient.patchJson(`/managers/${id}`, patch, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { manager: Manager };
  return body.manager;
}

export async function resetManagerPassword(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.postJson(
    `/managers/${id}/reset-password`,
    {},
    idToken,
  );
  await ensureOk(res);
}

export async function deactivateManager(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/managers/${id}`, idToken);
  await ensureOk(res);
}

export async function reactivateManager(
  idToken: string,
  id: string,
): Promise<Manager> {
  const res = await apiClient.postJson(
    `/managers/${id}/reactivate`,
    {},
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { manager: Manager };
  return body.manager;
}

export async function uploadManagerAvatar(
  idToken: string,
  id: string,
  file: File,
): Promise<Manager> {
  const fd = new FormData();
  fd.append("avatar", file);
  const res = await apiClient.postFormData(
    `/managers/${id}/avatar`,
    fd,
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { manager: Manager };
  return body.manager;
}
