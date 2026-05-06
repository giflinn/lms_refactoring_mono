import { apiClient, ApiClient } from "../../api/client";

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

// ---------- Telegram bot settings ----------

export type BotStatus =
  | "uninitialised"
  | "no_token"
  | "no_public_url"
  | "ready"
  | "error";

export type TelegramBotSettings = {
  // "" if no token saved; otherwise "••••••••<last4>".
  token: string;
  username: string;
  webhookSecretMasked: string;
  webhookUrl: string;
  backendPublicUrlConfigured: boolean;
  status: BotStatus;
  statusMessage: string | null;
};

export type TelegramBotHealth = {
  ok: boolean;
  info?: { id: number; username: string; firstName: string };
  webhookConfigured: boolean;
  pendingUpdateCount?: number;
  lastErrorMessage?: string;
  message?: string;
};

export async function fetchTelegramSettings(
  idToken: string,
): Promise<TelegramBotSettings> {
  const res = await apiClient.get("/telegram/settings", idToken);
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `GET /telegram/settings: ${res.status}`,
    );
  }
  return ((await res.json()) as { bot: TelegramBotSettings }).bot;
}

export async function patchTelegramToken(
  idToken: string,
  token: string,
): Promise<TelegramBotSettings> {
  const res = await apiClient.patchJson(
    "/telegram/settings",
    { token },
    idToken,
  );
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `PATCH /telegram/settings: ${res.status}`,
    );
  }
  return ((await res.json()) as { bot: TelegramBotSettings }).bot;
}

export async function checkTelegramHealth(
  idToken: string,
): Promise<TelegramBotHealth> {
  const res = await apiClient.postJson(
    "/telegram/settings/check",
    {},
    idToken,
  );
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `POST /telegram/settings/check: ${res.status}`,
    );
  }
  return ((await res.json()) as { health: TelegramBotHealth }).health;
}

// ---------- Telegram groups ----------

export type TelegramGroupBotStatus =
  | "admin"
  | "missing_rights"
  | "not_admin"
  | "not_member"
  | "chat_not_found"
  | "unknown";

export type TelegramGroup = {
  id: string;
  chatId: string;
  title: string;
  chatType: "channel" | "supergroup";
  inviteUsername: string | null;
  description: string | null;
  botStatus: TelegramGroupBotStatus;
  botStatusCheckedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchTelegramGroups(
  idToken: string,
): Promise<TelegramGroup[]> {
  const res = await apiClient.get("/telegram/groups", idToken);
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `GET /telegram/groups: ${res.status}`,
    );
  }
  return ((await res.json()) as { groups: TelegramGroup[] }).groups;
}

export async function addTelegramGroup(
  idToken: string,
  chatId: string,
): Promise<{ group: TelegramGroup; created: boolean }> {
  const res = await apiClient.postJson(
    "/telegram/groups",
    { chatId },
    idToken,
  );
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `POST /telegram/groups: ${res.status}`,
    );
  }
  const data = (await res.json()) as { group: TelegramGroup; created: boolean };
  return data;
}

export async function resyncTelegramGroup(
  idToken: string,
  id: string,
): Promise<TelegramGroup> {
  const res = await apiClient.postJson(
    `/telegram/groups/${id}/resync`,
    {},
    idToken,
  );
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `POST /telegram/groups/${id}/resync: ${res.status}`,
    );
  }
  return ((await res.json()) as { group: TelegramGroup }).group;
}

export async function archiveTelegramGroup(
  idToken: string,
  id: string,
  archive: boolean,
): Promise<TelegramGroup> {
  const path = archive
    ? `/telegram/groups/${id}/archive`
    : `/telegram/groups/${id}/unarchive`;
  const res = await apiClient.postJson(path, {}, idToken);
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `POST ${path}: ${res.status}`,
    );
  }
  return ((await res.json()) as { group: TelegramGroup }).group;
}

export async function patchTelegramGroup(
  idToken: string,
  id: string,
  updates: { title?: string; description?: string | null },
): Promise<TelegramGroup> {
  const res = await apiClient.patchJson(
    `/telegram/groups/${id}`,
    updates,
    idToken,
  );
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `PATCH /telegram/groups/${id}: ${res.status}`,
    );
  }
  return ((await res.json()) as { group: TelegramGroup }).group;
}

// Lightweight read used by the product form picker. Returns only non-archived
// groups where the bot is a fully-permissioned admin — i.e. the only groups
// you can attach to a new product.
export type TelegramPickerGroup = {
  id: string;
  title: string;
  chatType: "channel" | "supergroup";
};

export async function fetchTelegramPickerGroups(
  idToken: string,
): Promise<TelegramPickerGroup[]> {
  const res = await apiClient.get("/telegram/groups/picker", idToken);
  if (!res.ok) {
    throw new TelegramError(
      await ApiClient.parseErrorCode(res),
      `GET /telegram/groups/picker: ${res.status}`,
    );
  }
  return ((await res.json()) as { groups: TelegramPickerGroup[] }).groups;
}

export class TelegramError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TelegramError";
  }
}
