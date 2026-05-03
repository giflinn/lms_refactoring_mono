import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { ChatThread } from "../types";
import { formatListStamp } from "../format";

type Props = {
  thread: ChatThread;
  active: boolean;
  onClick: () => void;
};

export function ChatListItem({ thread, active, onClick }: Props) {
  const c = thread.client;
  const name = `${c.firstName} ${c.lastName}`.trim();
  const stamp = formatListStamp(thread.lastMessageAt);
  const unread = thread.unreadCount;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3 rounded-[10px] px-3 py-2 text-left transition-colors",
        active
          ? "bg-purple-tertiary/30"
          : "hover:bg-grey-lighter",
      )}
    >
      <Avatar
        src={c.avatarUrl}
        firstName={c.firstName}
        lastName={c.lastName}
        size={36}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-grey-dark">
            {name || "Клиент"}
          </span>
          <span className="shrink-0 text-[11px] text-grey-medium">{stamp}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-grey-medium">
            {thread.lastMessagePreview ?? "Нет сообщений"}
          </span>
          {unread > 0 && (
            <span className="ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-yellow-gradient-bottom px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        {thread.manager && (
          <span className="truncate text-[11px] text-grey-medium">
            Менеджер: {thread.manager.firstName} {thread.manager.lastName}
          </span>
        )}
      </div>
    </button>
  );
}
