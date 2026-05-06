import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchInput } from "../../../components/ui/SearchInput";
import { useAuth } from "../../../auth/AuthContext";
import { auth } from "../../../firebase";
import { Avatar } from "../../../components/Avatar";
import { Pagination } from "../../../components/ui/Pagination";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { listManagers } from "../../managers/api";
import { listClients } from "../../clients/api";
import { useOrders } from "../queries";
import type {
  FulfillmentStatus,
  OrderListItem,
  PaymentStatus,
} from "../api";
import { OrdersTable } from "../components/OrdersTable";
import { OrderDrawer } from "../components/OrderDrawer";
import {
  FULFILLMENT_OPTIONS,
  PAYMENT_OPTIONS,
} from "../components/StatusBadge";

const PAGE_SIZE = 10;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function OrdersPage() {
  const { user } = useAuth();
  const isPlainManager = user?.role === "manager";
  const showManagerFilter = !isPlainManager;

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<PaymentStatus | null>(null);
  const [fulfillmentStatusFilter, setFulfillmentStatusFilter] =
    useState<FulfillmentStatus | null>(null);

  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lazy: only fire dropdown queries on first open of the dropdown? Not
  // worth it — both lists are tiny on this app's scale and the user
  // typically opens both filters before searching.
  const clientsQuery = useQuery({
    queryKey: ["orders-clients-dropdown"] as const,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listClients(token, { pageSize: 50 });
      return res.clients;
    },
  });
  const managersQuery = useQuery({
    queryKey: ["orders-managers-dropdown"] as const,
    enabled: showManagerFilter,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listManagers(token, { pageSize: 50 });
      return res.managers;
    },
  });

  const list = useOrders({
    q,
    page,
    pageSize: PAGE_SIZE,
    clientId: clientFilter,
    managerId: managerFilter,
    paymentStatus: paymentStatusFilter,
    fulfillmentStatus: fulfillmentStatusFilter,
  });

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

  const clientOptions = useMemo<SelectOption<string>[]>(() => {
    return (clientsQuery.data ?? []).map((c) => ({
      value: c.id,
      label: `${c.firstName} ${c.lastName}`.trim() || c.email,
      leading: (
        <Avatar
          src={c.avatarUrl}
          firstName={c.firstName}
          lastName={c.lastName}
          email={c.email}
          size={28}
        />
      ),
    }));
  }, [clientsQuery.data]);

  const managerOptions = useMemo<SelectOption<string>[]>(() => {
    return (managersQuery.data ?? []).map((m) => ({
      value: m.id,
      label: `${m.firstName} ${m.lastName}`.trim() || m.email,
      leading: (
        <Avatar
          src={m.avatarUrl}
          firstName={m.firstName}
          lastName={m.lastName}
          email={m.email}
          size={28}
        />
      ),
    }));
  }, [managersQuery.data]);

  function handleOpen(o: OrderListItem) {
    setDrawerOrderId(o.id);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Поиск по № заказа или клиенту"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          className="w-[300px]"
        />
        <div className="w-[200px]">
          <Select<string>
            value={clientFilter}
            onChange={(v) => {
              setClientFilter(v);
              setPage(1);
            }}
            options={clientOptions}
            searchable
            clearable
            placeholder="Клиент"
          />
        </div>
        {showManagerFilter && (
          <div className="w-[200px]">
            <Select<string>
              value={managerFilter}
              onChange={(v) => {
                setManagerFilter(v);
                setPage(1);
              }}
              options={managerOptions}
              searchable
              clearable
              placeholder="Менеджер"
            />
          </div>
        )}
        <div className="w-[180px]">
          <Select<PaymentStatus>
            value={paymentStatusFilter}
            onChange={(v) => {
              setPaymentStatusFilter(v);
              setPage(1);
            }}
            options={PAYMENT_OPTIONS}
            clearable
            placeholder="Оплата"
          />
        </div>
        <div className="w-[180px]">
          <Select<FulfillmentStatus>
            value={fulfillmentStatusFilter}
            onChange={(v) => {
              setFulfillmentStatusFilter(v);
              setPage(1);
            }}
            options={FULFILLMENT_OPTIONS}
            clearable
            placeholder="Состояние"
          />
        </div>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить список заказов.
        </div>
      )}

      <OrdersTable orders={list.data?.orders ?? []} onOpen={handleOpen} />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <OrderDrawer
        orderId={drawerOrderId}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
