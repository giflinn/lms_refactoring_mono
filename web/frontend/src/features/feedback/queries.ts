import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  getFeedback,
  listFeedback,
  updateFeedback,
  type FeedbackStatus,
} from "./api";

const FEEDBACK_KEY = "feedback" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useFeedbackList(params: {
  q?: string;
  page: number;
  pageSize: number;
  status?: FeedbackStatus | null;
  clientId?: string | null;
}) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, "list", params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listFeedback(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

export function useFeedbackDetail(id: string | null) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, "detail", id] as const,
    enabled: id !== null,
    queryFn: async () => {
      const token = await getIdToken();
      return getFeedback(token, id as string);
    },
  });
}

export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      status?: FeedbackStatus;
      adminNote?: string | null;
    }) => {
      const token = await getIdToken();
      await updateFeedback(token, vars.id, {
        status: vars.status,
        adminNote: vars.adminNote,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [FEEDBACK_KEY, "list"] });
      qc.invalidateQueries({
        queryKey: [FEEDBACK_KEY, "detail", vars.id],
      });
      // Status changes shift the unread badge.
      qc.invalidateQueries({ queryKey: [FEEDBACK_KEY, "unread-count"] });
    },
  });
}
