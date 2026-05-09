import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchInput } from "../../../components/ui/SearchInput";
import { useAuth } from "../../../auth/AuthContext";
import { auth } from "../../../firebase";
import { Avatar } from "../../../components/Avatar";
import { Pagination } from "../../../components/ui/Pagination";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { listClients } from "../../clients/api";
import { useFeedbackList } from "../queries";
import type { FeedbackListItem, FeedbackStatus } from "../api";
import { FeedbackTable } from "../components/FeedbackTable";
import { FeedbackDrawer } from "../components/FeedbackDrawer";
import { FEEDBACK_STATUS_OPTIONS } from "../components/StatusBadge";

const PAGE_SIZE = 10;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function FeedbackPage() {
  const { user } = useAuth();
  const isPlainManager = user?.role === "manager";

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | null>(null);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Plain managers see only their own clients' feedback — no need to filter
  // server-side via clientId in addition (the RBAC scope already does that).
  // Keep the client dropdown only for senior_manager / admin.
  const clientsQuery = useQuery({
    queryKey: ["feedback-clients-dropdown"] as const,
    enabled: !isPlainManager,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listClients(token, { pageSize: 50 });
      return res.clients;
    },
  });

  const list = useFeedbackList({
    q,
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    clientId: clientFilter,
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

  function handleOpen(item: FeedbackListItem) {
    setDrawerId(item.id);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Поиск по клиенту или тексту"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          className="w-[300px]"
        />
        {!isPlainManager && (
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
        )}
        <div className="w-[180px]">
          <Select<FeedbackStatus>
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={FEEDBACK_STATUS_OPTIONS}
            clearable
            placeholder="Статус"
          />
        </div>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить запросы.
        </div>
      )}

      <FeedbackTable
        feedback={list.data?.feedback ?? []}
        onOpen={handleOpen}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <FeedbackDrawer
        feedbackId={drawerId}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
