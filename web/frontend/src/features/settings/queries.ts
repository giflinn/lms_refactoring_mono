import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  addTelegramGroup,
  archiveTelegramGroup,
  checkTelegramHealth,
  fetchSettings,
  fetchTelegramGroups,
  fetchTelegramPickerGroups,
  fetchTelegramSettings,
  patchSettings,
  patchTelegramGroup,
  patchTelegramToken,
  resyncTelegramGroup,
  type AppSettings,
  type TelegramBotHealth,
  type TelegramBotSettings,
  type TelegramGroup,
} from "./api";

const KEY = ["settings"] as const;
const TELEGRAM_BOT_KEY = ["telegram", "bot"] as const;
const TELEGRAM_GROUPS_KEY = ["telegram", "groups"] as const;
const TELEGRAM_PICKER_KEY = ["telegram", "groups", "picker"] as const;

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

// ---------- Telegram bot ----------

export function useTelegramSettings() {
  return useQuery({
    queryKey: TELEGRAM_BOT_KEY,
    queryFn: async () => fetchTelegramSettings(await token()),
  });
}

export function useSaveTelegramToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newToken: string) =>
      patchTelegramToken(await token(), newToken),
    onSuccess: (data: TelegramBotSettings) => {
      qc.setQueryData(TELEGRAM_BOT_KEY, data);
      // Token change may surface or hide groups (init flow re-checks status).
      qc.invalidateQueries({ queryKey: TELEGRAM_GROUPS_KEY });
    },
  });
}

export function useCheckTelegramHealth() {
  return useMutation({
    mutationFn: async (): Promise<TelegramBotHealth> =>
      checkTelegramHealth(await token()),
  });
}

// ---------- Telegram groups ----------

export function useTelegramGroups() {
  return useQuery({
    queryKey: TELEGRAM_GROUPS_KEY,
    queryFn: async () => fetchTelegramGroups(await token()),
  });
}

// Picker variant for the product form. Smaller payload, available to staff
// admins (not just admin) — matches the staff-admin gate the products page
// uses.
export function useTelegramPickerGroups(enabled: boolean) {
  return useQuery({
    queryKey: TELEGRAM_PICKER_KEY,
    queryFn: async () => fetchTelegramPickerGroups(await token()),
    enabled,
    staleTime: 60_000,
  });
}

export function useAddTelegramGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) =>
      addTelegramGroup(await token(), chatId),
    onSuccess: () => qc.invalidateQueries({ queryKey: TELEGRAM_GROUPS_KEY }),
  });
}

export function useResyncTelegramGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => resyncTelegramGroup(await token(), id),
    onSuccess: (group: TelegramGroup) => {
      qc.setQueryData<TelegramGroup[] | undefined>(
        TELEGRAM_GROUPS_KEY,
        (prev) => (prev ? prev.map((g) => (g.id === group.id ? group : g)) : prev),
      );
    },
  });
}

export function useArchiveTelegramGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; archive: boolean }) =>
      archiveTelegramGroup(await token(), params.id, params.archive),
    onSuccess: (group: TelegramGroup) => {
      qc.setQueryData<TelegramGroup[] | undefined>(
        TELEGRAM_GROUPS_KEY,
        (prev) => (prev ? prev.map((g) => (g.id === group.id ? group : g)) : prev),
      );
    },
  });
}

export function usePatchTelegramGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: { title?: string; description?: string | null };
    }) => patchTelegramGroup(await token(), params.id, params.updates),
    onSuccess: (group: TelegramGroup) => {
      qc.setQueryData<TelegramGroup[] | undefined>(
        TELEGRAM_GROUPS_KEY,
        (prev) => (prev ? prev.map((g) => (g.id === group.id ? group : g)) : prev),
      );
    },
  });
}
