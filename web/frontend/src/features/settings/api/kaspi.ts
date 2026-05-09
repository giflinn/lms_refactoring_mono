import { ApiClient, apiClient } from "../../../api/client";
import type { Role } from "../../../auth/api";

export type KaspiStrategy = "single" | "per_group";

export type KaspiManagerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
};

export type KaspiDefaultLink = {
  id: string;
  url: string;
  label: string;
};

export type KaspiGroupLink = {
  id: string;
  url: string;
  label: string;
  managers: KaspiManagerSummary[];
};

export type KaspiSettings = {
  strategy: KaspiStrategy;
  defaultLink: KaspiDefaultLink | null;
  groupLinks: KaspiGroupLink[];
  activeStaff: KaspiManagerSummary[];
};

export type KaspiSavePayload = {
  strategy: KaspiStrategy;
  defaultUrl: string;
  groupLinks: {
    id: string | null;
    url: string;
    label: string;
    managerIds: string[];
  }[];
};

export class KaspiApiError extends Error {
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
  throw new KaspiApiError(code, res.status);
}

export async function getKaspiSettings(
  idToken: string,
): Promise<KaspiSettings> {
  const res = await apiClient.get("/settings/kaspi", idToken);
  await ensureOk(res);
  return (await res.json()) as KaspiSettings;
}

export async function saveKaspiSettings(
  idToken: string,
  payload: KaspiSavePayload,
): Promise<void> {
  const res = await apiClient.put("/settings/kaspi", payload, idToken);
  await ensureOk(res);
}
