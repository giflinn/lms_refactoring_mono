import { useEffect, useMemo, useRef } from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { useAuth } from "../../../auth/AuthContext";
import {
  useJoinThread,
  useMarkRead,
  useMessages,
  useSendMessage,
  useThread,
} from "../queries";
import { dayKey, formatDaySeparator } from "../format";
import type { ChatMessage } from "../types";

type Props = {
  threadId: string;
};

export function ChatConversation({ threadId }: Props) {
  const { user } = useAuth();
  const threadQuery = useThread(threadId);
  const messagesQuery = useMessages(threadId);
  const sendMutation = useSendMessage(threadId);
  const joinMutation = useJoinThread();
  const markRead = useMarkRead();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when messages first land or a new one comes in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messagesQuery.data?.length]);

  // Fire a "read" once the thread is open and we have messages.
  useEffect(() => {
    if (!threadId) return;
    void markRead.mutateAsync(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messagesQuery.data?.length]);

  const messages = messagesQuery.data ?? [];
  const groups = useMemo(() => groupByDay(messages), [messages]);

  if (!threadQuery.data) {
    return (
      <div className="flex flex-1 items-center justify-center text-grey-medium text-[13px]">
        Загрузка...
      </div>
    );
  }
  const { thread, access } = threadQuery.data;

  return (
    <div className="flex flex-1 flex-col">
      <ConversationHeader thread={thread} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {groups.map((g) => (
          <div key={g.key} className="mb-4">
            <div className="my-2 flex items-center justify-center">
              <span className="text-[11px] text-grey-medium">
                {formatDaySeparator(g.iso)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {g.messages.map((m, i) => {
                const prev = i > 0 ? g.messages[i - 1] : null;
                const showAvatar =
                  m.kind === "text" &&
                  (!prev || prev.senderId !== m.senderId);
                const position = positionFor(m, user?.id ?? null);
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    position={position}
                    sender={m.sender}
                    showAvatar={showAvatar}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-[13px] text-grey-medium">
            Сообщений пока нет
          </div>
        )}
      </div>
      {access.canWrite ? (
        <MessageInput
          onSend={async (body, files) => {
            await sendMutation.mutateAsync({ body, files });
          }}
          placeholder="Напишите что то..."
        />
      ) : access.isSeniorOrAdmin ? (
        <div className="border-t border-grey-medium/20 p-3">
          <button
            type="button"
            onClick={async () => {
              await joinMutation.mutateAsync(threadId);
            }}
            disabled={joinMutation.isPending}
            className="h-10 w-full rounded-[10px] bg-purple-primary text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {joinMutation.isPending ? "..." : "Присоединиться к чату"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function positionFor(
  m: ChatMessage,
  viewerId: string | null,
): "left" | "right" | "center" {
  if (m.kind === "system") return "center";
  if (viewerId && m.senderId === viewerId) return "right";
  // Admin viewer treats client = left, staff = right.
  if (m.sender?.role === "client") return "left";
  return "right";
}

type DayGroup = { key: string; iso: string; messages: ChatMessage[] };

function groupByDay(messages: ChatMessage[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const k = dayKey(m.createdAt);
    let g = out[out.length - 1];
    if (!g || g.key !== k) {
      g = { key: k, iso: m.createdAt, messages: [] };
      out.push(g);
    }
    g.messages.push(m);
  }
  return out;
}
