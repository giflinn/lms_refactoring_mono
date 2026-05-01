import { Trash2, Star } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { Manager } from "../api";

type Props = {
  managers: Manager[];
  onEdit: (m: Manager) => void;
  onDeactivate: (m: Manager) => void;
};

export function ManagersTable({ managers, onEdit, onDeactivate }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center gap-6 bg-background px-6 py-4 text-[16px] font-medium text-grey-dark">
        <div className="w-[300px]">Менеджер</div>
        <div className="w-[132px]">Номер телефона</div>
        <div className="flex-1">Комментарий</div>
        <div className="w-[200px]" />
      </div>
      <div className="flex flex-col">
        {managers.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет менеджеров
          </div>
        ) : (
          managers.map((m, i) => (
            <ManagerRow
              key={m.id}
              manager={m}
              striped={i % 2 === 1}
              onEdit={() => onEdit(m)}
              onDeactivate={() => onDeactivate(m)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ManagerRow({
  manager,
  striped,
  onEdit,
  onDeactivate,
}: {
  manager: Manager;
  striped: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const isSenior = manager.role === "senior_manager";
  return (
    <div
      className={clsx(
        "flex items-center gap-6 border-b border-[#EAECF0] px-6 py-3",
        striped && "bg-grey-lighter",
      )}
    >
      <div className="flex w-[300px] items-center gap-3">
        <Avatar
          src={manager.avatarUrl}
          firstName={manager.firstName}
          lastName={manager.lastName}
          email={manager.email}
          size={44}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-[16px] font-medium leading-tight text-[#0E131F]">
              {manager.firstName} {manager.lastName}
            </p>
            {isSenior && (
              <Star
                size={16}
                strokeWidth={1.5}
                className="shrink-0 text-yellow-primary fill-yellow-primary"
              />
            )}
          </div>
          <p className="truncate text-[14px] font-medium leading-tight text-[#96999D]">
            {manager.email}
          </p>
        </div>
      </div>
      <div className="w-[132px] text-[14px] font-medium leading-tight text-grey-dark">
        {manager.phone ?? "—"}
      </div>
      <p className="line-clamp-2 max-h-[34px] flex-1 text-[14px] font-medium leading-tight text-grey-dark">
        {manager.comment ?? ""}
      </p>
      <div className="flex w-[200px] shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-6 py-3 text-[16px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
        >
          Редактировать
        </button>
        <button
          type="button"
          onClick={onDeactivate}
          aria-label="Удалить менеджера"
          className="cursor-pointer rounded-[8px] p-2.5 text-grey-dark hover:bg-grey-lighter transition-colors"
        >
          <Trash2 size={24} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
