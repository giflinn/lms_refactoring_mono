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
import { useCancellations } from "../queries";
import type { CancellationListItem, CancellationStatus } from "../api";
import { CancellationsTable } from "../components/CancellationsTable";
import { CancellationDrawer } from "../components/CancellationDrawer";
import { CANCELLATION_STATUS_OPTIONS } from "../components/StatusBadge";

const PAGE_SIZE = 10;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function CancellationsPage() {
  const { user } = useAuth();
  const isPlainManager = user?.role === "manager";
  const showManagerFilter = !isPlainManager;

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CancellationStatus | null>(null);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ["cancellations-clients-dropdown"] as const,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listClients(token, { pageSize: 50 });
      return res.clients;
    },
  });
  const managersQuery = useQuery({
    queryKey: ["cancellations-managers-dropdown"] as const,
    enabled: showManagerFilter,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listManagers(token, { pageSize: 50 });
      return res.managers;
    },
  });

  const list = useCancellations({
    q,
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    clientId: clientFilter,
    managerId: managerFilter,
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

  function handleOpen(c: CancellationListItem) {
    setDrawerId(c.id);
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
          <Select<CancellationStatus>
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={CANCELLATION_STATUS_OPTIONS}
            clearable
            placeholder="Статус"
          />
        </div>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить запросы на отмену.
        </div>
      )}

      <CancellationsTable
        cancellations={list.data?.cancellations ?? []}
        onOpen={handleOpen}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <CancellationDrawer
        cancellationId={drawerId}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
