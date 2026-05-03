import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { PageActionButton } from "../../../components/ui/PageActionButton";
import { Select } from "../../../components/ui/Select";
import { NotificationCard } from "../components/NotificationCard";
import { NotificationDrawer } from "../components/NotificationDrawer";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import { useDeleteNotification, useNotifications } from "../queries";
import type { ClientCategory, Notification } from "../api";

type StatusTab = "active" | "completed";
type CategoryFilter = "any" | "all" | ClientCategory;

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "any", label: "Все категории" },
  { value: "all", label: "Всем клиентам" },
  { value: "vip", label: "VIP" },
  { value: "new", label: "Новые" },
  { value: "regular", label: "Постоянные" },
];

export function NotificationsPage() {
  const [tab, setTab] = useState<StatusTab>("active");
  const [category, setCategory] = useState<CategoryFilter>("any");
  const [editing, setEditing] = useState<Notification | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);

  const list = useNotifications({
    status: tab,
    category: category === "any" ? undefined : category,
  });
  const deleteMutation = useDeleteNotification();

  const { oneShots, recurring } = useMemo(() => {
    const items = list.data ?? [];
    return {
      oneShots: items.filter((n) => !n.isRecurring),
      recurring: items.filter((n) => n.isRecurring),
    };
  }, [list.data]);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(n: Notification) {
    setEditing(n);
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error("[notifications] delete failed", err);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <SegmentedTabs tab={tab} onChange={setTab} />
          <Select<CategoryFilter>
            value={category}
            onChange={(v) => setCategory(v ?? "any")}
            options={CATEGORY_OPTIONS}
            variant="pill"
            className="w-[200px]"
          />
        </div>
        <PageActionButton
          onClick={openCreate}
          icon={<Plus size={20} strokeWidth={2} />}
        >
          Добавить нотификацию
        </PageActionButton>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить нотификации.
        </div>
      )}

      {list.isSuccess && oneShots.length === 0 && recurring.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-[rgba(102,112,133,0.3)] bg-white p-8 text-center text-[14px] text-grey-medium">
          {tab === "active" ? "Нет активных нотификаций" : "Нет завершенных нотификаций"}
        </div>
      )}

      {oneShots.length > 0 && (
        <div className="flex flex-col gap-2">
          {oneShots.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onEdit={() => openEdit(n)}
              onDelete={() => setDeleteTarget(n)}
            />
          ))}
        </div>
      )}

      {recurring.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="pt-2 text-[18px] font-semibold text-[#0E131F]">
            Регулярные
          </h3>
          {recurring.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onEdit={() => openEdit(n)}
              onDelete={() => setDeleteTarget(n)}
            />
          ))}
        </div>
      )}

      <NotificationDrawer
        open={drawerOpen}
        notification={editing}
        onClose={() => setDrawerOpen(false)}
      />

      <ConfirmDeleteModal
        notification={deleteTarget}
        pending={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: StatusTab;
  onChange: (t: StatusTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white p-0.5">
      <SegmentBtn label="Активные" active={tab === "active"} onClick={() => onChange("active")} />
      <SegmentBtn label="Завершенные" active={tab === "completed"} onClick={() => onChange("completed")} />
    </div>
  );
}

function SegmentBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "h-10 cursor-pointer rounded-[6px] px-4 text-[14px] font-medium transition-colors",
        active
          ? "border border-[rgba(102,112,133,0.3)] bg-purple-lighter text-purple-primary"
          : "text-[#0E131F] hover:bg-grey-lighter",
      )}
    >
      {label}
    </button>
  );
}
