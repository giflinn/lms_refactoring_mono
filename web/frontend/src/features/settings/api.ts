import { apiClient } from "../../api/client";

export type AppSettings = Record<string, string>;

export async function fetchSettings(idToken: string): Promise<AppSettings> {
  const res = await apiClient.get("/settings", idToken);
  if (!res.ok) throw new Error(`GET /settings: ${res.status}`);
  return ((await res.json()) as { settings: AppSettings }).settings;
}

export async function patchSettings(
  idToken: string,
  updates: AppSettings,
): Promise<AppSettings> {
  const res = await apiClient.patchJson(
    "/settings",
    { settings: updates },
    idToken,
  );
  if (!res.ok) throw new Error(`PATCH /settings: ${res.status}`);
  return ((await res.json()) as { settings: AppSettings }).settings;
}
