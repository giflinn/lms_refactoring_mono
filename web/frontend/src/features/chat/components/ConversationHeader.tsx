import { Avatar } from "../../../components/Avatar";
import type { ChatThread } from "../types";
import { formatPresence } from "../format";

type Props = {
  thread: ChatThread;
};

export function ConversationHeader({ thread }: Props) {
  const c = thread.client;
  const m = thread.manager;
  const presence = formatPresence(c.online, c.lastSeenAt);
  return (
    <div className="flex items-center gap-3 border-b border-grey-medium/20 px-4 py-3">
      <Avatar
        src={c.avatarUrl}
        firstName={c.firstName}
        lastName={c.lastName}
        size={36}
      />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-grey-dark">
            {`${c.firstName} ${c.lastName}`.trim() || "Клиент"}
          </span>
          {c.online && (
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          )}
        </div>
        <span className="text-[11px] text-grey-medium">{presence}</span>
      </div>
      {m && (
        <div className="flex items-center gap-2 rounded-[8px] bg-grey-lighter px-2 py-1">
          <Avatar
            src={m.avatarUrl}
            firstName={m.firstName}
            lastName={m.lastName}
            size={24}
          />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-grey-medium">
              Менеджер
            </span>
            <span className="text-[12px] font-medium text-grey-dark">
              {`${m.firstName} ${m.lastName}`.trim()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
