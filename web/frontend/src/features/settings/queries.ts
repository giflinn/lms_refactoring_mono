import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import { fetchSettings, patchSettings, type AppSettings } from "./api";

const KEY = ["settings"] as const;

async function token(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => fetchSettings(await token()),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: AppSettings) =>
      patchSettings(await token(), updates),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}
