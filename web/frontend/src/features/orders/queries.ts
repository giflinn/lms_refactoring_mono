import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  getOrder,
  listOrders,
  patchOrder,
  type FulfillmentStatus,
  type PaymentStatus,
} from "./api";

const ORDERS_KEY = "orders" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useOrders(params: {
  q?: string;
  page: number;
  pageSize: number;
  clientId?: string | null;
  managerId?: string | null;
  paymentStatus?: PaymentStatus | null;
  fulfillmentStatus?: FulfillmentStatus | null;
}) {
  return useQuery({
    queryKey: [ORDERS_KEY, "list", params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listOrders(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: [ORDERS_KEY, "detail", id] as const,
    enabled: id !== null,
    queryFn: async () => {
      const token = await getIdToken();
      return getOrder(token, id as string);
    },
  });
}

export function usePatchOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      paymentStatus?: PaymentStatus;
      fulfillmentStatus?: FulfillmentStatus;
      force?: boolean;
    }) => {
      const token = await getIdToken();
      return patchOrder(token, vars.id, {
        paymentStatus: vars.paymentStatus,
        fulfillmentStatus: vars.fulfillmentStatus,
        force: vars.force,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [ORDERS_KEY, "list"] });
      qc.invalidateQueries({ queryKey: [ORDERS_KEY, "detail", vars.id] });
    },
  });
}
