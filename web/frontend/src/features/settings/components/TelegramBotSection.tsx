import { useEffect, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import {
  useCheckTelegramHealth,
  useSaveTelegramToken,
  useTelegramSettings,
} from "../queries";
import type { BotStatus } from "../api";
import { TelegramError } from "../api";

// "Telegram бот" card on the admin settings page. Combines bot creds (token /
// username) with health surface (webhook status, last error, manual recheck).
//
// State machine:
//   no_token       → empty, prompt for token
//   ready          → green pill, all fields populated, edit/clear actions
//   no_public_url  → yellow warning ("BACKEND_PUBLIC_URL не задан"), token
//                    saved but webhook not registered yet
//   error          → red banner with statusMessage, edit/clear actions
//
// Token PATCH is wrapped in a confirmation flow: clearing requires an inline
// "Точно?" confirm because shutting down the bot kicks every running
// integration. Re-saving a new token is mostly safe (still re-inits webhook).
export function TelegramBotSection() {
  const settings = useTelegramSettings();
  const saveToken = useSaveTelegramToken();
  const checkHealth = useCheckTelegramHealth();

  const [editing, setEditing] = useState(false);
  const [draftToken, setDraftToken] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);

  // When server data lands and there's no token yet, default to edit mode so
  // the user lands on the input directly.
  useEffect(() => {
    if (settings.data && !settings.data.token) {
      setEditing(true);
    }
  }, [settings.data]);

  if (settings.isLoading) {
    return (
      <Card title="Telegram бот">
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      </Card>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <Card title="Telegram бот">
        <p className="text-red-500 text-[14px]">
          Не удалось загрузить настройки бота.
        </p>
      </Card>
    );
  }

  const data = settings.data;
  const hasToken = data.token !== "";

  const onSaveToken = async (newToken: string) => {
    try {
      await saveToken.mutateAsync(newToken);
      toast.success(
        newToken === "" ? "Бот отключён" : "Токен сохранён, бот подключён",
      );
      setEditing(false);
      setDraftToken("");
      setConfirmingClear(false);
    } catch (err) {
      const code = err instanceof TelegramError ? err.code : "unknown_error";
      const msg =
        code === "invalid_token"
          ? "Telegram отверг токен. Проверьте, что вы скопировали его без пробелов."
          : code === "bot_has_no_username"
            ? "У бота не задано @username. Назначьте его в @BotFather и попробуйте снова."
            : `Не удалось сохранить токен (${code}).`;
      toast.error(msg);
    }
  };

  const onCheckHealth = async () => {
    try {
      const health = await checkHealth.mutateAsync();
      if (!health.ok) {
        toast.error(health.message ?? "Проверка не удалась");
        return;
      }
      const lines: string[] = [];
      if (health.info?.username) lines.push(`@${health.info.username}`);
      lines.push(
        health.webhookConfigured
          ? "Webhook зарегистрирован"
          : "Webhook не зарегистрирован",
      );
      if (health.pendingUpdateCount && health.pendingUpdateCount > 0) {
        lines.push(`Очередь Telegram: ${health.pendingUpdateCount}`);
      }
      if (health.lastErrorMessage) {
        lines.push(`Последняя ошибка: ${health.lastErrorMessage}`);
      }
      toast.success(lines.join(" · "));
    } catch (err) {
      const code = err instanceof TelegramError ? err.code : "unknown_error";
      toast.error(`Проверка не удалась (${code})`);
    }
  };

  return (
    <Card title="Telegram бот">
      <div className="flex flex-col gap-4">
        <StatusBanner
          status={data.status}
          statusMessage={data.statusMessage}
          backendPublicUrlConfigured={data.backendPublicUrlConfigured}
        />

        {hasToken && !editing && (
          <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 text-[14px]">
            <span className="text-grey-medium pt-2">@username</span>
            <UsernameRow username={data.username} />

            <span className="text-grey-medium pt-2">Токен</span>
            <div className="flex h-[36px] items-center text-grey-dark font-mono text-[13px]">
              {data.token || "—"}
            </div>

            <span className="text-grey-medium pt-2">Webhook URL</span>
            <WebhookUrlRow url={data.webhookUrl} />

            <span className="text-grey-medium pt-2">Webhook secret</span>
            <div className="flex h-[36px] items-center text-grey-dark font-mono text-[13px]">
              {data.webhookSecretMasked || "—"}
            </div>
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-3">
            <Input
              label="Bot token (от @BotFather)"
              fullWidth
              value={draftToken}
              type="password"
              autoFocus
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              onChange={(e) => setDraftToken(e.target.value)}
            />
            <p className="text-grey-medium text-[12px] leading-tight">
              Создайте бота через @BotFather (команда{" "}
              <code className="font-mono">/newbot</code>) и вставьте сюда
              полученный HTTP API token. Он будет отправлен только на наш
              сервер и сохранится в зашифрованном виде в DB.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                onClick={() => onSaveToken(draftToken.trim())}
                disabled={
                  draftToken.trim() === "" ||
                  draftToken.trim() === data.token ||
                  saveToken.isPending
                }
                className="!w-auto"
              >
                {saveToken.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftToken("");
                }}
                className="cursor-pointer text-[14px] font-medium text-grey-dark px-4 py-[10px] rounded-[8px] hover:bg-grey-lighter"
              >
                Отмена
              </button>
            </>
          ) : hasToken ? (
            <>
              <Button
                onClick={() => setEditing(true)}
                className="!w-auto"
              >
                Изменить токен
              </Button>
              <button
                type="button"
                onClick={onCheckHealth}
                disabled={checkHealth.isPending}
                className="flex h-[40px] cursor-pointer items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-4 text-[14px] font-medium text-grey-dark hover:bg-grey-lighter disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  strokeWidth={1.5}
                  className={clsx(checkHealth.isPending && "animate-spin")}
                />
                Перепроверить
              </button>
              {confirmingClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => onSaveToken("")}
                    disabled={saveToken.isPending}
                    className="rounded-[8px] border border-red-500 px-4 py-[10px] text-[14px] font-medium text-red-500 cursor-pointer hover:bg-red-50 disabled:opacity-60"
                  >
                    Точно отключить
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="cursor-pointer text-[14px] font-medium text-grey-dark px-2 py-[10px]"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  className="ml-auto cursor-pointer text-[14px] font-medium text-grey-medium hover:text-red-500"
                >
                  Отключить бота
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <h2 className="text-[16px] font-semibold text-[#0E131F] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function StatusBanner(props: {
  status: BotStatus;
  statusMessage: string | null;
  backendPublicUrlConfigured: boolean;
}) {
  const { status, statusMessage, backendPublicUrlConfigured } = props;
  if (status === "no_token" || status === "uninitialised") {
    return (
      <Banner tone="neutral">
        Бот не настроен. Создайте бота в{" "}
        <a
          href="https://t.me/BotFather"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          @BotFather
        </a>{" "}
        и вставьте токен ниже.
      </Banner>
    );
  }
  if (status === "no_public_url") {
    return (
      <Banner tone="warn">
        Токен сохранён, но переменная окружения{" "}
        <code className="font-mono">BACKEND_PUBLIC_URL</code> не задана —
        webhook не зарегистрирован, бот не получает события. Настройте
        переменную и перезапустите backend, либо нажмите «Перепроверить»
        после того как переменная появится.
      </Banner>
    );
  }
  if (status === "ready") {
    return (
      <Banner tone="ok">
        Бот подключён{!backendPublicUrlConfigured && " (без webhook)"}.
      </Banner>
    );
  }
  if (status === "error") {
    return (
      <Banner tone="error">
        Ошибка: {statusMessage ?? "неизвестно"}
      </Banner>
    );
  }
  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "neutral" | "warn" | "error";
  children: React.ReactNode;
}) {
  const palette: Record<typeof tone, string> = {
    ok: "bg-green-50 border-green-200 text-green-800",
    neutral: "bg-grey-lighter border-[rgba(102,112,133,0.3)] text-grey-dark",
    warn: "bg-yellow-50 border-yellow-300 text-yellow-900",
    error: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] leading-snug",
        palette[tone],
      )}
    >
      <Check size={16} strokeWidth={2} className={tone === "ok" ? "" : "hidden"} />
      <span>{children}</span>
    </div>
  );
}

function UsernameRow({ username }: { username: string }) {
  if (!username) return <span className="text-grey-medium pt-2">—</span>;
  return (
    <div className="flex items-center gap-2">
      <a
        href={`https://t.me/${username}`}
        target="_blank"
        rel="noreferrer"
        className="text-purple-primary hover:underline text-[14px] font-medium"
      >
        @{username}
      </a>
      <CopyButton value={`@${username}`} label="Скопировать @username" />
    </div>
  );
}

function WebhookUrlRow({ url }: { url: string }) {
  if (!url) {
    return (
      <span className="pt-2 text-grey-medium text-[13px]">
        не задан (нужен <code className="font-mono">BACKEND_PUBLIC_URL</code>)
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-grey-dark font-mono text-[12px] truncate">{url}</span>
      <CopyButton value={url} label="Скопировать URL" />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Не удалось скопировать");
        }
      }}
      className="cursor-pointer text-grey-medium hover:text-grey-dark transition-colors"
    >
      {copied ? (
        <Check size={16} strokeWidth={2} className="text-green-600" />
      ) : (
        <Copy size={16} strokeWidth={1.5} />
      )}
    </button>
  );
}
