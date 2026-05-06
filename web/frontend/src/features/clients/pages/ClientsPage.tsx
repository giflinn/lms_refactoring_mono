import { useMemo, useState } from "react";
import { SearchInput } from "../../../components/ui/SearchInput";
import { ClientsTable } from "../components/ClientsTable";
import { ClientDrawer } from "../components/ClientDrawer";
import { DeleteClientDialog } from "../components/DeleteClientDialog";
import { CATEGORY_OPTIONS } from "../components/CategoryBadge";
import { Pagination } from "../../../components/ui/Pagination";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { Toggle } from "../../../components/ui/Toggle";
import { Avatar } from "../../../components/Avatar";
import { useAuth } from "../../../auth/AuthContext";
import {
  useClients,
  useDeactivateClient,
  useReactivateClient,
  useStaffList,
} from "../queries";
import { ApiError, type Client, type ClientCategory } from "../api";
import { mapError } from "../errors";

const PAGE_SIZE = 10;

export function ClientsPage() {
  const { user } = useAuth();
  const isPlainManager = user?.role === "manager";
  const showManagerFilter = !isPlainManager;

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ClientCategory | null>(
    null,
  );
  const [showDeactivated, setShowDeactivated] = useState(false);

  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const list = useClients({
    q,
    page,
    pageSize: PAGE_SIZE,
    managerId: managerFilter,
    category: categoryFilter,
    status: showDeactivated ? "all" : "active",
  });
  const staffList = useStaffList(showManagerFilter);
  const deactivate = useDeactivateClient();
  const reactivate = useReactivateClient();

  async function handleReactivate(c: Client) {
    try {
      await reactivate.mutateAsync(c.id);
    } catch (err) {
      console.error("[clients] reactivate failed", err);
    }
  }

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

  const managerOptions = useMemo<SelectOption<string>[]>(() => {
    return (staffList.data ?? []).map((m) => ({
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
  }, [staffList.data]);

  function openEdit(c: Client) {
    setEditTarget(c);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(undefined);
    try {
      await deactivate.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(mapError(err.code).general);
      } else {
        setDeleteError("Нет соединения с сервером.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center gap-4">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          className="w-[300px]"
        />
        {showManagerFilter && (
          <div className="w-[220px]">
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
        <div className="w-[200px]">
          <Select<ClientCategory>
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
            options={CATEGORY_OPTIONS}
            clearable
            placeholder="Категория"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-grey-dark">
          <Toggle
            checked={showDeactivated}
            onChange={(v) => {
              setShowDeactivated(v);
              setPage(1);
            }}
          />
          Показать деактивированных
        </label>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить список клиентов.
        </div>
      )}

      <ClientsTable
        clients={list.data?.clients ?? []}
        onEdit={openEdit}
        onDelete={(c) => {
          setDeleteError(undefined);
          setDeleteTarget(c);
        }}
        onReactivate={handleReactivate}
        reactivatingId={reactivate.isPending ? reactivate.variables : undefined}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <ClientDrawer
        open={drawerOpen}
        client={editTarget}
        onClose={closeDrawer}
      />

      <DeleteClientDialog
        client={deleteTarget}
        pending={deactivate.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
