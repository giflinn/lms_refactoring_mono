// Reads/writes against the app_settings table. Public-facing fields are
// returned via /support/info to the unauthenticated mobile clients; the full
// set is editable from the admin panel by senior_manager + admin.
//
// Defaults are baked in here rather than inserted as seed rows so a freshly
// migrated DB doesn't require an extra seed step. Missing rows fall back to
// the default — the admin can override by writing to the table.
//
// SECRET keys (e.g. telegram bot token, webhook secret) are never returned
// raw to the admin panel — getSettingsMasked replaces them with "••••" + last
// four chars. Server-side code that needs the real value calls getSettings
// directly.

import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "../db/schema";

export const SETTING_KEYS = {
  supportWhatsapp: "support_whatsapp",
  supportHours: "support_hours",
  // Bot token from @BotFather. Secret. Once set we initialise the bot, set
  // its webhook, and pin the username.
  telegramBotToken: "telegram_bot_token",
  // Cached @username of the bot (without the leading @) — populated from
  // getMe when the token is saved/changed. Public, used to render deep
  // links and admin copy buttons.
  telegramBotUsername: "telegram_bot_username",
  // Random string we hand to setWebhook → Telegram echoes it in the
  // X-Telegram-Bot-Api-Secret-Token header on every POST. Auto-generated
  // (32 hex chars) on first token save; rotated on demand. Secret.
  telegramWebhookSecret: "telegram_webhook_secret",
  // How clients are assigned to a manager when they register without a
  // manager code. Strategy ∈ {any_admin, any_senior_manager, any_manager,
  // specific}. When 'specific', target_id holds the staff user id.
  // Resolution lives in services/managerAssignment.ts.
  managerAssignmentOnRegisterStrategy:
    "manager_assignment_on_register_strategy",
  managerAssignmentOnRegisterTargetId:
    "manager_assignment_on_register_target_id",
  // How a deactivated manager's clients are redistributed. Same shape as
  // the on-register pair above. Used by the DELETE /managers/:id handler.
  managerAssignmentOnDeleteStrategy:
    "manager_assignment_on_delete_strategy",
  managerAssignmentOnDeleteTargetId:
    "manager_assignment_on_delete_target_id",
  // Routing strategy for the Kaspi payment link surfaced to mobile after
  // order creation. 'single' → every client gets the default link.
  // 'per_group' → if the client's manager belongs to a kaspi_links group,
  // that group's link wins; otherwise the default applies. The kill-switch
  // shape lets the admin temporarily disable group routing without
  // tearing down the configured groups.
  kaspiStrategy: "kaspi_strategy",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.supportWhatsapp]: "",
  [SETTING_KEYS.supportHours]: "",
  [SETTING_KEYS.telegramBotToken]: "",
  [SETTING_KEYS.telegramBotUsername]: "",
  [SETTING_KEYS.telegramWebhookSecret]: "",
  // Default to "any_admin": matches the legacy "oldest staff" fallback well
  // enough on a fresh install (only the seeded admin exists), and is the
  // safest pick if the admin never edits the setting.
  [SETTING_KEYS.managerAssignmentOnRegisterStrategy]: "any_admin",
  [SETTING_KEYS.managerAssignmentOnRegisterTargetId]: "",
  [SETTING_KEYS.managerAssignmentOnDeleteStrategy]: "any_admin",
  [SETTING_KEYS.managerAssignmentOnDeleteTargetId]: "",
  // Default to the safer "everyone gets the default link" behavior; admin
  // can flip to per_group once they've configured groups.
  [SETTING_KEYS.kaspiStrategy]: "single",
} as const;

const ALL_KEYS = Object.values(SETTING_KEYS) as SettingKey[];

// Public keys are safe to expose without authentication (the mobile app
// fetches them on launch to render the chat help dialog).
export const PUBLIC_KEYS: ReadonlySet<SettingKey> = new Set([
  SETTING_KEYS.supportWhatsapp,
  SETTING_KEYS.supportHours,
]);

// Keys whose values must never be returned in plaintext to a human (admin
// UI included). They round-trip via PATCH where the input is the real value
// but GET responses get masked. Server-side code that needs the actual
// value uses getSettings directly.
const SECRET_KEYS: ReadonlySet<SettingKey> = new Set([
  SETTING_KEYS.telegramBotToken,
  SETTING_KEYS.telegramWebhookSecret,
]);

export function isSecretKey(key: SettingKey): boolean {
  return SECRET_KEYS.has(key);
}

// "abc...wxyz" → "••••••••wxyz". Empty values stay empty so the UI can show
// "Не настроено" instead of a fake mask.
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••••••" + value.slice(-4);
}

export async function getSettings(
  keys: readonly SettingKey[] = ALL_KEYS,
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [...keys]));
  const found = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, string> = {};
  for (const k of keys) {
    out[k] = found.get(k) ?? DEFAULTS[k];
  }
  return out;
}

// Same shape as getSettings but with secret-marked keys replaced by the
// "••••wxyz" mask. Use this for any payload that flows back to the browser
// or a logging surface.
export async function getSettingsMasked(
  keys: readonly SettingKey[] = ALL_KEYS,
): Promise<Record<string, string>> {
  const raw = await getSettings(keys);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = (SECRET_KEYS as Set<string>).has(k) ? maskSecret(v) : v;
  }
  return out;
}

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row[0]?.value ?? DEFAULTS[key];
}

export async function setSetting(
  key: SettingKey,
  value: string,
  updatedByUserId: string,
): Promise<void> {
  const trimmed = value ?? "";
  await db
    .insert(appSettings)
    .values({
      key,
      value: trimmed,
      updatedAt: new Date(),
      updatedByUserId,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: trimmed, updatedAt: new Date(), updatedByUserId },
    });
}

export function isValidSettingKey(key: string): key is SettingKey {
  return (ALL_KEYS as string[]).includes(key);
}
