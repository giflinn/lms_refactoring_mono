import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SearchInput } from "../../../components/ui/SearchInput";
import IconChatEmpty from "../../../assets/icons/chat-empty.svg?react";
import { ChatList } from "../components/ChatList";
import { ChatConversation } from "../components/ChatConversation";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { Avatar } from "../../../components/Avatar";
import { useThreads } from "../queries";
import { useChatSocket } from "../socket";
import { chatKeys } from "../queries";
import { useAuth } from "../../../auth/AuthContext";
import { useStaffList } from "../../clients/queries";
import type { ChatMessage, ChatThread } from "../types";

const FILTER_OPTIONS: SelectOption<"all" | "unread" | "unanswered">[] = [
  { value: "all", label: "Все" },
  { value: "unread", label: "Непрочитанные" },
  { value: "unanswered", label: "Без ответа менеджера" },
];

const SORT_OPTIONS: SelectOption<"newest" | "oldest" | "name">[] = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "name", label: "Сортировать А-Я" },
];

const ALL_MANAGERS = "__all__";

export function ChatsPage() {
  const { user } = useAuth();
  const isStaffAdmin =
    user?.role === "senior_manager" || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "unanswered">("all");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = useState<string | null>(null);

  const params = useMemo(
    () => ({ search: search || undefined, filter, managerId, sort }),
    [search, filter, managerId, sort],
  );

  const threadsQuery = useThreads(params);
  const staffList = useStaffList(isStaffAdmin);
  const qc = useQueryClient();

  const handleMessageNew = useCallback(
    (e: { threadId: string; message: ChatMessage }) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(e.threadId) });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
    [qc],
  );
  const handleThreadUpdated = useCallback(
    (_e: { threadId: string }) => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
    [qc],
  );
  const handleMessageRead = useCallback(
    (_e: { threadId: string; userId: string }) => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
    [qc],
  );
  const handlePresence = useCallback(
    (e: { userId: string; online: boolean; lastSeenAt: string }) => {
      qc.setQueriesData<ChatThread[]>({ queryKey: ["chat", "threads"] }, (old) =>
        old
          ? old.map((t) => {
              const next = { ...t };
              if (t.client.id === e.userId) {
                next.client = {
                  ...t.client,
                  online: e.online,
                  lastSeenAt: e.lastSeenAt,
                };
              }
              if (t.manager && t.manager.id === e.userId) {
                next.manager = {
                  ...t.manager,
                  online: e.online,
                  lastSeenAt: e.lastSeenAt,
                };
              }
              return next;
            })
          : old,
      );
      qc.invalidateQueries({ queryKey: ["chat", "thread"] });
    },
    [qc],
  );

  useChatSocket(
    {
      "message:new": handleMessageNew,
      "thread:updated": handleThreadUpdated,
      "message:read": handleMessageRead,
      "presence:update": handlePresence,
    },
    selected,
  );

  // Keep selected thread in sync with the visible list. If a filter change
  // wipes out the previously-selected thread (or empties the list entirely),
  // we'd otherwise keep showing a stale conversation on the right while the
  // list says "Чатов нет". Reset to the first match, or to nothing.
  useEffect(() => {
    const list = threadsQuery.data;
    if (!list) return;
    if (list.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !list.some((t) => t.id === selected)) {
      setSelected(list[0].id);
    }
  }, [threadsQuery.data, selected]);

  const managerOptions: SelectOption<string>[] = [
    { value: ALL_MANAGERS, label: "Все менеджеры" },
    ...((staffList.data ?? []).map((m) => ({
      value: m.id,
      label: `${m.firstName} ${m.lastName}`.trim() || m.email,
      leading: (
        <Avatar
          src={m.avatarUrl}
          firstName={m.firstName}
          lastName={m.lastName}
          email={m.email}
          size={24}
        />
      ),
    }))),
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            className="w-[280px]"
          />
          <div className="w-[200px]">
            <Select
              value={filter}
              onChange={(v) => v && setFilter(v)}
              options={FILTER_OPTIONS}
            />
          </div>
          <div className="w-[180px]">
            <Select
              value={sort}
              onChange={(v) => v && setSort(v)}
              options={SORT_OPTIONS}
            />
          </div>
          {isStaffAdmin && (
            <div className="w-[220px]">
              <Select
                value={managerId ?? ALL_MANAGERS}
                onChange={(v) =>
                  setManagerId(!v || v === ALL_MANAGERS ? null : v)
                }
                options={managerOptions}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-[12px] border border-grey-medium/20 bg-white">
        <ChatList
          threads={threadsQuery.data ?? []}
          loading={threadsQuery.isLoading}
          selectedId={selected}
          onSelect={setSelected}
        />
        <div className="flex flex-1 flex-col">
          {selected ? (
            <ChatConversation threadId={selected} />
          ) : (
            <EmptyConversation />
          )}
        </div>
      </div>

    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <IconChatEmpty width={94} height={94} className="mb-4" />
      <h3 className="text-[14px] font-semibold text-grey-dark">
        Сообщений пока нет...
      </h3>
      <p className="mt-1 text-[12px] text-grey-medium">
        Выберите контакт чтобы начать общение.
      </p>
    </div>
  );
}
