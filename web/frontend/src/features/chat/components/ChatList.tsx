import { ChatListItem } from "./ChatListItem";
import type { ChatThread } from "../types";

type Props = {
  threads: ChatThread[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/**
 * Left pane of the two-pane chat layout. Just the list — search, filter and
 * sort controls live on ChatsPage's top toolbar so the page header stays
 * visually consistent with Товары / Менеджеры (one row of filters → primary
 * action on the right).
 */
export function ChatList(props: Props) {
  return (
    <div className="flex w-[360px] shrink-0 flex-col border-r border-grey-medium/20">
      <div className="flex-1 overflow-y-auto p-2">
        {props.loading && (
          <div className="p-4 text-[12px] text-grey-medium">Загрузка...</div>
        )}
        {!props.loading && props.threads.length === 0 && (
          <div className="p-4 text-[12px] text-grey-medium">Чатов нет</div>
        )}
        <div className="flex flex-col gap-1">
          {props.threads.map((t) => (
            <ChatListItem
              key={t.id}
              thread={t}
              active={t.id === props.selectedId}
              onClick={() => props.onSelect(t.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
