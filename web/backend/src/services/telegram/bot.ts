// Telegram bot lifecycle. Single grammY instance per process, lazily created
// from the token stored in app_settings. Re-initialised when the admin
// changes the token via /telegram/settings.
//
// Design notes:
//   - Webhook only. Polling would require env-aware code paths (CLAUDE.md
//     forbids per-env config), and prod already has the public URL handy.
//   - On boot we read settings; if the token is present and BACKEND_PUBLIC_URL
//     is set we (re-)register the webhook and refresh getMe. Either missing
//     piece logs a warning and the bot stays offline — admin can complete
//     the wiring from the settings page without a redeploy.
//   - allowed_updates explicitly includes "chat_member" — Telegram leaves it
//     out by default and that breaks the join/leave correlation we depend on
//     once Stage 2 ships per-user invite links.

import { randomBytes } from "node:crypto";
import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../../config";
import {
  SETTING_KEYS,
  getSetting,
  setSetting,
} from "../appSettings";
import { registerHandlers } from "./handlers";

export type BotInfo = {
  id: number;
  username: string;
  firstName: string;
};

type BotState =
  | { status: "uninitialised" }
  | { status: "no_token" }
  | { status: "no_public_url"; bot: Bot; info: BotInfo }
  | { status: "ready"; bot: Bot; info: BotInfo; webhookUrl: string }
  | { status: "error"; message: string };

let state: BotState = { status: "uninitialised" };

const ALLOWED_UPDATES = [
  "message",
  "channel_post",
  "callback_query",
  "my_chat_member",
  "chat_member",
] as const;

export function getBotState(): BotState {
  return state;
}

export function getBot(): Bot | null {
  if (state.status === "ready" || state.status === "no_public_url") {
    return state.bot;
  }
  return null;
}

export function getBotInfo(): BotInfo | null {
  if (state.status === "ready" || state.status === "no_public_url") {
    return state.info;
  }
  return null;
}

export function webhookUrl(): string {
  if (!config.backendPublicUrl) return "";
  // Strip a trailing slash to keep the joined URL clean. Telegram is strict
  // about exact-match URLs when retrying — small detail but worth nailing.
  const base = config.backendPublicUrl.replace(/\/$/, "");
  return `${base}/telegram/webhook`;
}

// Called from index.ts once at startup. Re-runnable when the admin changes
// settings — see /telegram/settings PATCH handler.
export async function initBot(): Promise<void> {
  const token = (await getSetting(SETTING_KEYS.telegramBotToken)).trim();
  if (!token) {
    state = { status: "no_token" };
    console.log("[telegram] bot token not set — skipping init");
    return;
  }

  let bot: Bot;
  let info: BotInfo;
  try {
    bot = new Bot(token);
    const me = await bot.api.getMe();
    info = {
      id: me.id,
      username: me.username ?? "",
      firstName: me.first_name,
    };
  } catch (err) {
    const message = describeApiError(err);
    state = { status: "error", message };
    console.error("[telegram] bot init failed:", message);
    return;
  }

  registerHandlers(bot);

  // Cache the username for the admin UI / mobile deep links so we don't have
  // to call getMe on every read.
  await setSettingSystem(SETTING_KEYS.telegramBotUsername, info.username);

  const url = webhookUrl();
  if (!url) {
    state = { status: "no_public_url", bot, info };
    console.warn(
      "[telegram] BACKEND_PUBLIC_URL not set — bot is configured but webhook is not registered",
    );
    return;
  }

  // Make sure a webhook secret exists. Auto-generate on first run; admins can
  // rotate it from the settings page later.
  let secret = (await getSetting(SETTING_KEYS.telegramWebhookSecret)).trim();
  if (!secret) {
    secret = randomBytes(24).toString("hex");
    await setSettingSystem(SETTING_KEYS.telegramWebhookSecret, secret);
  }

  try {
    await bot.api.setWebhook(url, {
      secret_token: secret,
      allowed_updates: [...ALLOWED_UPDATES],
      drop_pending_updates: false,
    });
    state = { status: "ready", bot, info, webhookUrl: url };
    console.log(
      `[telegram] @${info.username} ready, webhook → ${url} (allowed: ${ALLOWED_UPDATES.join(",")})`,
    );
  } catch (err) {
    const message = describeApiError(err);
    state = { status: "error", message };
    console.error("[telegram] setWebhook failed:", message);
  }
}

// Removes the webhook and clears the in-process bot. Called when the admin
// clears the token from the settings page.
export async function shutdownBot(): Promise<void> {
  const bot = getBot();
  if (bot) {
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (err) {
      console.warn("[telegram] deleteWebhook failed:", describeApiError(err));
    }
  }
  state = { status: "no_token" };
}

// Re-runs getMe + getWebhookInfo without changing the token. Used by the
// "Перепроверить" button in the admin UI to surface the current health.
export async function checkBotHealth(): Promise<{
  ok: boolean;
  info?: BotInfo;
  webhookConfigured: boolean;
  pendingUpdateCount?: number;
  lastErrorMessage?: string;
  message?: string;
}> {
  const bot = getBot();
  if (!bot) {
    return {
      ok: false,
      webhookConfigured: false,
      message:
        state.status === "no_token"
          ? "no_token"
          : state.status === "error"
            ? state.message
            : "not_initialised",
    };
  }
  try {
    const me = await bot.api.getMe();
    const wh = await bot.api.getWebhookInfo();
    return {
      ok: true,
      info: {
        id: me.id,
        username: me.username ?? "",
        firstName: me.first_name,
      },
      webhookConfigured: Boolean(wh.url),
      pendingUpdateCount: wh.pending_update_count,
      lastErrorMessage: wh.last_error_message ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      webhookConfigured: false,
      message: describeApiError(err),
    };
  }
}

export function describeApiError(err: unknown): string {
  if (err instanceof GrammyError) {
    return `${err.error_code} ${err.description}`;
  }
  if (err instanceof HttpError) {
    return `http ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// Setting writes performed by the bot subsystem itself (not a user action) —
// updated_by_user_id is null. We can't import setSetting because it requires
// a userId; this is a thin wrapper that bypasses that constraint via a
// direct upsert mirroring setSetting's behaviour.
async function setSettingSystem(
  key: (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS],
  value: string,
): Promise<void> {
  const { db } = await import("../../db");
  const { appSettings } = await import("../../db/schema");
  await db
    .insert(appSettings)
    .values({
      key,
      value,
      updatedAt: new Date(),
      updatedByUserId: null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date(), updatedByUserId: null },
    });
}
