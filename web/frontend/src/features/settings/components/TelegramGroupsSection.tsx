import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Hash,
  Megaphone,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { PageActionButton } from "../../../components/ui/PageActionButton";
import {
  useArchiveTelegramGroup,
  useResyncTelegramGroup,
  useTelegramGroups,
  useTelegramSettings,
} from "../queries";
import type {
  TelegramGroup,
  TelegramGroupBotStatus,
} from "../api";
import { AddGroupModal } from "./AddGroupModal";

// "Группы Telegram" card. Lists every registered chat with bot status and
// admin actions (resync, archive, unarchive). Disabled when the bot itself
// isn't ready — it makes no sense to add groups before the bot can probe
// them.
//
// Stage 2 will gate archive on "no active products use this group". For
// Stage 1 we just toggle archived_at.
export function TelegramGroupsSection() {
  const settings = useTelegramSettings();
  const groups = useTelegramGroups();
  const [showAdd, setShowAdd] = useState(false);

  const botUsername = settings.data?.username ?? "";
  const botReady = settings.data?.status === "ready";

  const { active, archived } = useMemo(() => {
    const list = groups.data ?? [];
    return {
      active: list.filter((g) => !g.archivedAt),
      archived: list.filter((g) => g.archivedAt),
    };
  }, [groups.data]);

  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-semibold text-[#0E131F]">
          Группы Telegram
        </h2>
        <PageActionButton
          icon={<Plus size={20} strokeWidth={1.5} />}
          onClick={() => setShowAdd(true)}
          disabled={!botReady}
        >
          Добавить группу
        </PageActionButton>
      </div>

      {!botReady && (
        <p className="text-grey-medium text-[14px] mb-4">
          Сначала подключите бота выше — без него мы не можем проверить статус
          группы.
        </p>
      )}

      {groups.isLoading ? (
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      ) : groups.isError ? (
        <p className="text-red-500 text-[14px]">
          Не удалось загрузить список групп.
        </p>
      ) : (active.length === 0 && archived.length === 0) ? (
        <EmptyState botReady={botReady} />
      ) : (
        <>
          <GroupsTable groups={active} />
          {archived.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-[14px] font-medium text-grey-medium hover:text-grey-dark">
                Архив ({archived.length})
              </summary>
              <div className="mt-3">
                <GroupsTable groups={archived} archivedView />
              </div>
            </details>
          )}
        </>
      )}

      <AddGroupModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        botUsername={botUsername}
      />
    </section>
  );
}

function EmptyState({ botReady }: { botReady: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[rgba(102,112,133,0.3)] py-10 px-6 text-center">
      <p className="text-grey-dark text-[14px] font-medium">Пока ни одной группы</p>
      <p className="text-grey-medium text-[13px] mt-1 max-w-[420px]">
        {botReady
          ? "Добавьте бота в нужную группу/канал как админа и нажмите «Добавить группу»."
          : "После подключения бота сможете зарегистрировать группы и каналы."}
      </p>
    </div>
  );
}

function GroupsTable({
  groups,
  archivedView,
}: {
  groups: TelegramGroup[];
  archivedView?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[rgba(102,112,133,0.2)]">
      <div className="grid grid-cols-[2fr_120px_1.4fr_1.2fr_140px_140px] bg-grey-lighter px-4 py-2 text-[12px] font-semibold text-grey-medium uppercase tracking-wide">
        <div>Название</div>
        <div>Тип</div>
        <div>chat_id</div>
        <div>Статус бота</div>
        <div>Проверено</div>
        <div className="text-right">Действия</div>
      </div>
      {groups.map((g) => (
        <GroupRow key={g.id} group={g} archivedView={Boolean(archivedView)} />
      ))}
    </div>
  );
}

function GroupRow({
  group,
  archivedView,
}: {
  group: TelegramGroup;
  archivedView: boolean;
}) {
  const resync = useResyncTelegramGroup();
  const archive = useArchiveTelegramGroup();

  const onResync = async () => {
    try {
      await resync.mutateAsync(group.id);
      toast.success("Статус обновлён");
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };
  const onToggleArchive = async () => {
    try {
      await archive.mutateAsync({ id: group.id, archive: !archivedView });
      toast.success(archivedView ? "Восстановлено" : "Перенесено в архив");
    } catch {
      toast.error("Не удалось изменить");
    }
  };

  return (
    <div
      className={clsx(
        "grid grid-cols-[2fr_120px_1.4fr_1.2fr_140px_140px] items-center border-t border-[#EAECF0] px-4 py-3 text-[13px]",
        archivedView && "opacity-60",
      )}
    >
      <div className="flex flex-col">
        <span className="font-medium text-grey-dark truncate">{group.title}</span>
        {group.inviteUsername && (
          <a
            href={`https://t.me/${group.inviteUsername}`}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-purple-primary hover:underline"
          >
            @{group.inviteUsername}
          </a>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-grey-dark">
        {group.chatType === "channel" ? (
          <Megaphone size={14} strokeWidth={1.5} />
        ) : (
          <Users size={14} strokeWidth={1.5} />
        )}
        {group.chatType === "channel" ? "Канал" : "Группа"}
      </div>
      <div className="flex items-center gap-1.5">
        <Hash size={12} strokeWidth={1.5} className="text-grey-medium shrink-0" />
        <span className="font-mono text-[12px] text-grey-dark truncate">
          {group.chatId}
        </span>
        <button
          type="button"
          aria-label="Скопировать chat_id"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(group.chatId);
              toast.success("chat_id скопирован");
            } catch {
              toast.error("Не удалось скопировать");
            }
          }}
          className="cursor-pointer text-grey-medium hover:text-grey-dark"
        >
          <Copy size={12} strokeWidth={1.5} />
        </button>
      </div>
      <BotStatusPill status={group.botStatus} />
      <span className="text-grey-medium text-[12px]">
        {formatRelative(group.botStatusCheckedAt)}
      </span>
      <div className="flex items-center justify-end gap-1">
        <IconButton
          aria-label="Обновить статус"
          onClick={onResync}
          loading={resync.isPending}
        >
          <RefreshCw
            size={16}
            strokeWidth={1.5}
            className={clsx(resync.isPending && "animate-spin")}
          />
        </IconButton>
        <IconButton
          aria-label={archivedView ? "Восстановить" : "В архив"}
          onClick={onToggleArchive}
          loading={archive.isPending}
        >
          {archivedView ? (
            <ArchiveRestore size={16} strokeWidth={1.5} />
          ) : (
            <Archive size={16} strokeWidth={1.5} />
          )}
        </IconButton>
      </div>
    </div>
  );
}

function BotStatusPill({ status }: { status: TelegramGroupBotStatus }) {
  const map: Record<
    TelegramGroupBotStatus,
    { label: string; tone: "ok" | "warn" | "error" | "neutral" }
  > = {
    admin: { label: "Активен", tone: "ok" },
    missing_rights: { label: "Не хватает прав", tone: "warn" },
    not_admin: { label: "Не админ", tone: "warn" },
    not_member: { label: "Не в чате", tone: "error" },
    chat_not_found: { label: "Чат не найден", tone: "error" },
    unknown: { label: "Неизвестно", tone: "neutral" },
  };
  const { label, tone } = map[status];
  const palette: Record<typeof tone, string> = {
    ok: "bg-green-50 text-green-700 border-green-200",
    warn: "bg-yellow-50 text-yellow-800 border-yellow-300",
    error: "bg-red-50 text-red-600 border-red-200",
    neutral: "bg-grey-lighter text-grey-dark border-[rgba(102,112,133,0.3)]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center self-start rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight",
        palette[tone],
      )}
    >
      {label}
    </span>
  );
}

function IconButton({
  children,
  onClick,
  loading,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      disabled={loading}
      className="rounded-[6px] p-1.5 text-grey-medium hover:bg-grey-lighter hover:text-grey-dark cursor-pointer transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "только что";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`;
  if (diffSec < 86400 * 14) return `${Math.floor(diffSec / 86400)} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}
