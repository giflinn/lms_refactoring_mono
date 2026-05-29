import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  decideCancellation,
  getCancellation,
  listCancellations,
  type CancellationDecision,
  type CancellationStatus,
} from "./api";

const CANCELLATIONS_KEY = "cancellations" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useCancellations(params: {
  q?: string;
  page: number;
  pageSize: number;
  status?: CancellationStatus | null;
  clientId?: string | null;
  managerId?: string | null;
}) {
  return useQuery({
    queryKey: [CANCELLATIONS_KEY, "list", params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listCancellations(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

export function useCancellation(id: string | null) {
  return useQuery({
    queryKey: [CANCELLATIONS_KEY, "detail", id] as const,
    enabled: id !== null,
    queryFn: async () => {
      const token = await getIdToken();
      return getCancellation(token, id as string);
    },
  });
}

export function useDecideCancellation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      decision: CancellationDecision;
      comment: string | null;
    }) => {
      const token = await getIdToken();
      return decideCancellation(token, vars.id, {
        decision: vars.decision,
        comment: vars.comment,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [CANCELLATIONS_KEY, "list"] });
      qc.invalidateQueries({
        queryKey: [CANCELLATIONS_KEY, "detail", vars.id],
      });
      // Approval cascades to fulfillment_status='cancelled' on the order, so
      // the orders list/detail must invalidate too.
      qc.invalidateQueries({ queryKey: ["orders", "list"] });
    },
  });
}
