import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  deleteReviewReply,
  listReviews,
  moderateReview,
  replyToReview,
  type ReviewModerateAction,
  type ReviewStatus,
} from "./api";

const REVIEWS_KEY = "reviews" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useReviews(params: {
  q?: string;
  page: number;
  pageSize: number;
  status?: ReviewStatus | null;
  clientId?: string | null;
  managerId?: string | null;
}) {
  return useQuery({
    queryKey: [REVIEWS_KEY, "list", params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listReviews(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; action: ReviewModerateAction }) => {
      const token = await getIdToken();
      await moderateReview(token, vars.id, vars.action);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REVIEWS_KEY, "list"] });
    },
  });
}

export function useReplyToReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; text: string }) => {
      const token = await getIdToken();
      return replyToReview(token, vars.id, vars.text);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REVIEWS_KEY, "list"] });
    },
  });
}

export function useDeleteReviewReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { replyId: string }) => {
      const token = await getIdToken();
      await deleteReviewReply(token, vars.replyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REVIEWS_KEY, "list"] });
    },
  });
}
