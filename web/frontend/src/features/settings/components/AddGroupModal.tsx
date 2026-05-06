import { useEffect, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Check, Copy, X } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { useAddTelegramGroup } from "../queries";
import { TelegramError } from "../api";

// Two-tab modal for onboarding a Telegram chat:
//   - "Через бота" — instructions; the chat owner adds the bot as admin and
//     types /register inside the chat. Self-service, zero clicks here.
//   - "Вручную" — paste chat_id; we probe via getChat and create the row.
//
// Both produce identical telegram_groups rows; the bot-driven path is more
// foolproof because it implicitly verifies "bot is in chat" before we even
// touch the DB.
export function AddGroupModal({
  open,
  onClose,
  botUsername,
}: {
  open: boolean;
  onClose: () => void;
  botUsername: string;
}) {
  const [tab, setTab] = useState<"bot" | "manual">("bot");
  const [chatId, setChatId] = useState("");
  const add = useAddTelegramGroup();

  // Reset when reopened so a stale chat_id doesn't persist between sessions.
  useEffect(() => {
    if (open) {
      setTab("bot");
      setChatId("");
    }
  }, [open]);

  const onSubmit = async () => {
    const trimmed = chatId.trim();
    if (!trimmed) return;
    try {
      const result = await add.mutateAsync(trimmed);
      toast.success(
        result.created
          ? `Группа «${result.group.title}» добавлена`
          : `Группа «${result.group.title}» обновлена`,
      );
      onClose();
    } catch (err) {
      const code = err instanceof TelegramError ? err.code : "unknown_error";
      const map: Record<string, string> = {
        invalid_chat_id: "Неправильный chat_id (должен быть целым числом, например -1001234567890).",
        chat_not_found: "Чат не найден. Проверьте chat_id или что бот добавлен в этот чат.",
        bot_not_member: "Бот не состоит в этом чате. Сначала добавьте его как участника.",
        bot_not_configured: "Сначала подключите бота на этой странице.",
        chat_metadata_unavailable: "Не удалось получить данные чата от Telegram.",
        probe_failed: "Telegram отклонил запрос. Возможно, бот не имеет прав читать чат.",
      };
      toast.error(map[code] ?? `Не удалось добавить (${code})`);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-[560px] max-w-[90vw] flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#EAECF0]">
          <h3 className="text-[16px] font-semibold text-[#0E131F]">
            Добавить группу или канал
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-md p-1.5 text-grey-dark hover:bg-grey-lighter cursor-pointer"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex border-b border-[#EAECF0] px-6">
          <TabButton active={tab === "bot"} onClick={() => setTab("bot")}>
            Через бота
          </TabButton>
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
            Вручную
          </TabButton>
        </div>

        <div className="px-6 py-5">
          {tab === "bot" ? (
            <BotOnboardingSteps botUsername={botUsername} />
          ) : (
            <ManualForm
              chatId={chatId}
              setChatId={setChatId}
              onSubmit={onSubmit}
              submitting={add.isPending}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-4 py-3 text-[14px] font-medium border-b-2 -mb-px transition-colors cursor-pointer",
        active
          ? "border-purple-primary text-purple-primary"
          : "border-transparent text-grey-medium hover:text-grey-dark",
      )}
    >
      {children}
    </button>
  );
}

function BotOnboardingSteps({ botUsername }: { botUsername: string }) {
  return (
    <ol className="flex flex-col gap-4 text-[14px] text-grey-dark">
      <Step n={1}>
        Скопируйте имя бота и добавьте его в нужную группу или канал:
        <UsernameRow username={botUsername} />
      </Step>
      <Step n={2}>
        Назначьте бота администратором с правами:
        <ul className="mt-1.5 ml-1 list-disc list-inside text-grey-medium text-[13px] leading-snug">
          <li>«Пригласительные ссылки» (Invite Users)</li>
          <li>«Блокировка пользователей» (Ban Users)</li>
        </ul>
        <p className="mt-1.5 text-grey-medium text-[13px] leading-snug">
          Без этих прав бот не сможет выдавать инвайты и удалять пользователей
          по истечении заказа.
        </p>
      </Step>
      <Step n={3}>
        В этой же группе или канале отправьте сообщение:
        <CommandPill command={`/register${botUsername ? `@${botUsername}` : ""}`} />
        <p className="mt-1.5 text-grey-medium text-[13px] leading-snug">
          Бот ответит подтверждением и группа сразу появится в списке выше.
          Вы сможете переименовать её и добавить описание для клиентов.
        </p>
      </Step>
    </ol>
  );
}

function ManualForm(props: {
  chatId: string;
  setChatId: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const { chatId, setChatId, onSubmit, submitting } = props;
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="chat_id"
        fullWidth
        value={chatId}
        autoFocus
        placeholder="-1001234567890"
        onChange={(e) => setChatId(e.target.value)}
      />
      <div className="rounded-[8px] bg-grey-lighter p-3 text-[13px] text-grey-dark leading-snug">
        <p className="font-medium mb-1">Где взять chat_id:</p>
        <ul className="list-disc list-inside ml-1 text-grey-medium space-y-1">
          <li>
            Отправьте любое сообщение из канала боту{" "}
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noreferrer"
              className="text-purple-primary hover:underline"
            >
              @userinfobot
            </a>
            {" "}— он покажет ID.
          </li>
          <li>
            Или: добавьте нашего бота в чат и отправьте{" "}
            <code className="font-mono">/register</code> — chat_id появится в
            ответе и в списке групп выше.
          </li>
        </ul>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={!chatId.trim() || submitting}
          className="!w-auto"
        >
          {submitting ? "Проверка…" : "Добавить"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-primary text-white text-[12px] font-semibold">
        {n}
      </span>
      <div className="flex-1 leading-snug">{children}</div>
    </li>
  );
}

function UsernameRow({ username }: { username: string }) {
  if (!username) {
    return (
      <p className="mt-1 text-grey-medium text-[13px]">
        @username бота появится после подключения токена.
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="rounded-[6px] border border-[#EAECF0] bg-grey-lighter px-2 py-1 font-mono text-[13px] text-grey-dark">
        @{username}
      </code>
      <CopyButton value={`@${username}`} />
    </div>
  );
}

function CommandPill({ command }: { command: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="rounded-[6px] border border-[#EAECF0] bg-grey-lighter px-2 py-1 font-mono text-[13px] text-grey-dark">
        {command}
      </code>
      <CopyButton value={command} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
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
