import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  deactivateClient,
  listClients,
  reactivateClient,
  updateClient,
  type ClientCategory,
  type ClientPatch,
  type ClientStatusFilter,
} from "./api";
import { listManagers } from "../managers/api";

const CLIENTS_KEY = "clients" as const;
const STAFF_KEY = "staff-list" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useClients(params: {
  q?: string;
  page: number;
  pageSize: number;
  managerId?: string | null;
  category?: ClientCategory | null;
  status?: ClientStatusFilter;
}) {
  return useQuery({
    queryKey: [CLIENTS_KEY, params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listClients(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

// Reuses /managers — admins see all staff, senior managers see only ordinary
// managers, plain managers don't open this dropdown at all (UI hides it).
export function useStaffList(enabled: boolean) {
  return useQuery({
    queryKey: [STAFF_KEY] as const,
    enabled,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listManagers(token, { pageSize: 50 });
      return res.managers;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
}

export function useUpdateClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: ClientPatch }) => {
      const token = await getIdToken();
      return updateClient(token, vars.id, vars.patch);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeactivateClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deactivateClient(token, id);
    },
    onSuccess: () => invalidate(),
  });
}

export function useReactivateClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      return reactivateClient(token, id);
    },
    onSuccess: () => invalidate(),
  });
}
