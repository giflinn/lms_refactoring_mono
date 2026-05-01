import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { ManagersTable } from "../components/ManagersTable";
import { ManagerDrawer } from "../components/ManagerDrawer";
import { DeactivateDialog } from "../components/DeactivateDialog";
import { Pagination } from "../../../components/ui/Pagination";
import { useDeactivateManager, useManagers } from "../queries";
import type { Manager } from "../api";
import { ApiError } from "../api";
import { mapError } from "../errors";

const PAGE_SIZE = 10;

export function ManagersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manager | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Manager | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | undefined>();

  const list = useManagers({ q, page, pageSize: PAGE_SIZE });
  const deactivate = useDeactivateManager();

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

  function openCreate() {
    setEditTarget(null);
    setDrawerOpen(true);
  }
  function openEdit(m: Manager) {
    setEditTarget(m);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditTarget(null);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivateError(undefined);
    try {
      await deactivate.mutateAsync(deactivateTarget.id);
      setDeactivateTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setDeactivateError(mapError(err.code).general);
      } else {
        setDeactivateError("Нет соединения с сервером.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="relative w-[300px]">
          <Search
            size={20}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-medium"
          />
          <input
            type="text"
            placeholder="Поиск"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="h-11 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white pl-10 pr-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary py-2.5 pl-5 pr-6 text-[16px] font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={20} strokeWidth={2} />
          Добавить менеджера
        </button>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить список менеджеров.
        </div>
      )}

      <ManagersTable
        managers={list.data?.managers ?? []}
        onEdit={openEdit}
        onDeactivate={(m) => {
          setDeactivateError(undefined);
          setDeactivateTarget(m);
        }}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <ManagerDrawer
        open={drawerOpen}
        manager={editTarget}
        onClose={closeDrawer}
      />

      <DeactivateDialog
        manager={deactivateTarget}
        pending={deactivate.isPending}
        error={deactivateError}
        onConfirm={confirmDeactivate}
        onClose={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
