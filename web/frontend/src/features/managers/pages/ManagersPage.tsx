import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { ManagersTable } from "../components/ManagersTable";
import { DeactivateDialog } from "../components/DeactivateDialog";
import { Pagination } from "../../../components/ui/Pagination";
import { Toggle } from "../../../components/ui/Toggle";
import {
  useDeactivateManager,
  useManagers,
  useReactivateManager,
} from "../queries";
import { useManagerDrawer } from "../ManagerDrawerContext";
import type { Manager } from "../api";
import { ApiError } from "../api";
import { mapError } from "../errors";

const PAGE_SIZE = 10;

export function ManagersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [showDeactivated, setShowDeactivated] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<Manager | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | undefined>();

  const list = useManagers({
    q,
    page,
    pageSize: PAGE_SIZE,
    status: showDeactivated ? "all" : "active",
  });
  const deactivate = useDeactivateManager();
  const reactivate = useReactivateManager();
  const { openCreate, openEdit } = useManagerDrawer();

  async function handleReactivate(m: Manager) {
    try {
      await reactivate.mutateAsync(m.id);
    } catch (err) {
      console.error("[managers] reactivate failed", err);
    }
  }

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
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
        <button
          type="button"
          onClick={openCreate}
          className="flex cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary py-2 pl-4 pr-5 text-[14px] font-medium text-white hover:opacity-90 transition-opacity"
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
        onReactivate={handleReactivate}
        reactivatingId={reactivate.isPending ? reactivate.variables : undefined}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

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
