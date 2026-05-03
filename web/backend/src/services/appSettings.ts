// Reads/writes against the app_settings table. Public-facing fields are
// returned via /support/info to the unauthenticated mobile clients; the full
// set is editable from the admin panel by senior_manager + admin.
//
// Defaults are baked in here rather than inserted as seed rows so a freshly
// migrated DB doesn't require an extra seed step. Missing rows fall back to
// the default — the admin can override by writing to the table.

import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "../db/schema";

export const SETTING_KEYS = {
  supportWhatsapp: "support_whatsapp",
  supportHours: "support_hours",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.supportWhatsapp]: "",
  [SETTING_KEYS.supportHours]: "",
};

const ALL_KEYS = Object.values(SETTING_KEYS) as SettingKey[];

// Public keys are safe to expose without authentication (the mobile app
// fetches them on launch to render the chat help dialog).
export const PUBLIC_KEYS: ReadonlySet<SettingKey> = new Set([
  SETTING_KEYS.supportWhatsapp,
  SETTING_KEYS.supportHours,
]);

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
