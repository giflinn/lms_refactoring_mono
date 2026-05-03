import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  getThread,
  joinThread,
  listMessages,
  listThreads,
  markRead,
  sendMessage,
  type ListThreadsParams,
} from "./api";
import type { ChatMessage, ChatThread, ChatThreadAccess } from "./types";

async function token(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export const chatKeys = {
  threads: (params: ListThreadsParams) =>
    ["chat", "threads", params] as const,
  thread: (id: string) => ["chat", "thread", id] as const,
  messages: (id: string) => ["chat", "thread", id, "messages"] as const,
};

export function useThreads(params: ListThreadsParams) {
  return useQuery<ChatThread[]>({
    queryKey: chatKeys.threads(params),
    queryFn: async () => listThreads(await token(), params),
    refetchOnWindowFocus: false,
  });
}

export function useThread(threadId: string | null) {
  return useQuery<{ thread: ChatThread; access: ChatThreadAccess }>({
    queryKey: threadId ? chatKeys.thread(threadId) : ["chat", "thread", "none"],
    queryFn: async () => getThread(await token(), threadId!),
    enabled: !!threadId,
    refetchOnWindowFocus: false,
  });
}

export function useMessages(threadId: string | null) {
  return useQuery<ChatMessage[]>({
    queryKey: threadId
      ? chatKeys.messages(threadId)
      : ["chat", "thread", "none", "messages"],
    queryFn: async () => listMessages(await token(), threadId!, { limit: 50 }),
    enabled: !!threadId,
    refetchOnWindowFocus: false,
  });
}

export function useSendMessage(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; files: File[] }) =>
      sendMessage(await token(), threadId, input.body, input.files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => markRead(await token(), threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
  });
}

export function useJoinThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => joinThread(await token(), threadId),
    onSuccess: (_d, threadId) => {
      qc.invalidateQueries({ queryKey: chatKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
    },
  });
}
