import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { useAuth } from "../../../auth/AuthContext";
import { auth } from "../../../firebase";
import { listMessages } from "../api";
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

const PAGE_SIZE = 50;
// How close to the top before we kick off a load-older fetch.
const TOP_TRIGGER_PX = 100;
// How close to the bottom counts as "the user is following the conversation"
// — we only auto-scroll on incoming messages while inside this band.
const BOTTOM_FOLLOW_PX = 100;

export function ChatConversation({ threadId }: Props) {
  const { user } = useAuth();
  const threadQuery = useThread(threadId);
  const messagesQuery = useMessages(threadId);
  const sendMutation = useSendMessage(threadId);
  const joinMutation = useJoinThread();
  const markRead = useMarkRead();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Older pages prepended on scroll-up. useMessages owns the latest 50 (and
  // refetches them on socket invalidations); olderMessages is everything we've
  // fetched manually above that window.
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // After prepending older messages, we want the user's visual position to
  // stay put — so we capture (scrollHeight - scrollTop) before the fetch and
  // restore it post-layout.
  const pendingRestoreRef = useRef<number | null>(null);
  // Track first-paint scroll-to-bottom + auto-follow on new latest message.
  const initialScrolledRef = useRef(false);
  const lastLatestIdRef = useRef<string | null>(null);

  // Reset per-thread state on switch.
  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(true);
    setLoadingOlder(false);
    pendingRestoreRef.current = null;
    initialScrolledRef.current = false;
    lastLatestIdRef.current = null;
  }, [threadId]);

  // Combined render list (older + latest), de-duplicated by id in case the
  // window boundaries overlap after a refetch.
  const messages = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const m of [...olderMessages, ...(messagesQuery.data ?? [])]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [olderMessages, messagesQuery.data]);

  // Restore visual scroll position after older-messages prepend. Runs before
  // paint so the user never sees the jumped-to-top frame.
  useLayoutEffect(() => {
    if (pendingRestoreRef.current === null) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight - pendingRestoreRef.current;
    pendingRestoreRef.current = null;
  }, [olderMessages]);

  // Initial scroll-to-bottom on thread open + auto-follow new messages while
  // the user is near the bottom. Keyed on messagesQuery.data so prepending
  // older pages (which only changes olderMessages) doesn't trigger this.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const list = messagesQuery.data ?? [];
    if (list.length === 0) return;
    const latest = list[list.length - 1];
    if (!initialScrolledRef.current) {
      el.scrollTop = el.scrollHeight;
      initialScrolledRef.current = true;
      lastLatestIdRef.current = latest.id;
      return;
    }
    if (lastLatestIdRef.current !== latest.id) {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < BOTTOM_FOLLOW_PX) el.scrollTop = el.scrollHeight;
      lastLatestIdRef.current = latest.id;
    }
  }, [messagesQuery.data]);

  // Fire a "read" once the thread is open and we have messages.
  useEffect(() => {
    if (!threadId) return;
    void markRead.mutateAsync(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messagesQuery.data?.length]);

  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || loadingOlder || !hasMoreOlder) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    pendingRestoreRef.current = el.scrollHeight - el.scrollTop;
    try {
      const u = auth.currentUser;
      if (!u) return;
      const t = await u.getIdToken();
      const page = await listMessages(t, threadId, {
        before: oldest.createdAt,
        limit: PAGE_SIZE,
      });
      if (page.length < PAGE_SIZE) setHasMoreOlder(false);
      if (page.length > 0) {
        setOlderMessages((prev) => [...page, ...prev]);
      } else {
        pendingRestoreRef.current = null;
      }
    } catch (e) {
      pendingRestoreRef.current = null;
      console.warn("[chat] load older failed", e);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, loadingOlder, messages, threadId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < TOP_TRIGGER_PX) void loadOlder();
  }, [loadOlder]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader thread={thread} />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {loadingOlder && (
          <div className="flex justify-center py-2 text-[12px] text-grey-medium">
            Загрузка...
          </div>
        )}
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
