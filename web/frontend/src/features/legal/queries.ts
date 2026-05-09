import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  getLegal,
  listLegal,
  updateLegal,
  type LegalSlug,
} from "./api";

const LEGAL_KEY = "legal" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useLegalList() {
  return useQuery({
    queryKey: [LEGAL_KEY, "list"] as const,
    queryFn: () => listLegal(),
  });
}

export function useLegalDocument(slug: LegalSlug | null) {
  return useQuery({
    queryKey: [LEGAL_KEY, "detail", slug] as const,
    enabled: slug !== null,
    queryFn: () => getLegal(slug as LegalSlug),
  });
}

export function useUpdateLegal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slug: LegalSlug;
      title?: string;
      contentHtml: string;
    }) => {
      const token = await getIdToken();
      await updateLegal(token, vars.slug, {
        title: vars.title,
        contentHtml: vars.contentHtml,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [LEGAL_KEY, "list"] });
      qc.invalidateQueries({ queryKey: [LEGAL_KEY, "detail", vars.slug] });
    },
  });
}
