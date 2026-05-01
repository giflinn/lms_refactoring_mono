import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  createManager,
  deactivateManager,
  listManagers,
  resetManagerPassword,
  updateManager,
  uploadManagerAvatar,
  type ManagerInput,
} from "./api";

const MANAGERS_KEY = "managers" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useManagers(params: {
  q?: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: [MANAGERS_KEY, params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listManagers(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [MANAGERS_KEY] });
}

export function useCreateManager() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: ManagerInput) => {
      const token = await getIdToken();
      return createManager(token, input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateManager() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<ManagerInput> }) => {
      const token = await getIdToken();
      return updateManager(token, vars.id, vars.patch);
    },
    onSuccess: () => invalidate(),
  });
}

export function useResetManagerPassword() {
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await resetManagerPassword(token, id);
    },
  });
}

export function useDeactivateManager() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deactivateManager(token, id);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUploadManagerAvatar() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (vars: { id: string; file: File }) => {
      const token = await getIdToken();
      return uploadManagerAvatar(token, vars.id, vars.file);
    },
    onSuccess: () => invalidate(),
  });
}
