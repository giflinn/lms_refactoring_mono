import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
  type ClientCategory,
  type NotificationInput,
} from "./api";

const NOTIFICATIONS_KEY = "notifications" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useNotifications(params: {
  status: "active" | "completed";
  category?: ClientCategory | "all";
}) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listNotifications(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
}

export function useCreateNotification() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: NotificationInput) => {
      const token = await getIdToken();
      return createNotification(token, input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateNotification() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (vars: { id: string; input: NotificationInput }) => {
      const token = await getIdToken();
      return updateNotification(token, vars.id, vars.input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteNotification() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deleteNotification(token, id);
    },
    onSuccess: () => invalidate(),
  });
}
