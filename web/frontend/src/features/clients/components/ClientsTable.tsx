import { RotateCcw, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { Client } from "../api";
import { CategoryBadge } from "./CategoryBadge";

type Props = {
  clients: Client[];
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  onReactivate: (c: Client) => void;
  reactivatingId?: string;
};

export function ClientsTable({
  clients,
  onEdit,
  onDelete,
  onReactivate,
  reactivatingId,
}: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center gap-6 bg-background px-6 py-3 text-[14px] font-medium text-grey-dark">
        <div className="w-[280px]">Клиент</div>
        <div className="w-[280px]">Менеджер</div>
        <div className="flex-1">Категория</div>
        <div className="w-[200px]" />
      </div>
      <div className="flex flex-col">
        {clients.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет клиентов
          </div>
        ) : (
          clients.map((c, i) => (
            <ClientRow
              key={c.id}
              client={c}
              striped={i % 2 === 1}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c)}
              onReactivate={() => onReactivate(c)}
              reactivating={reactivatingId === c.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PersonCell({
  firstName,
  lastName,
  email,
  avatarUrl,
  badge,
}: {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        src={avatarUrl}
        firstName={firstName}
        lastName={lastName}
        email={email}
        size={36}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
            {firstName} {lastName}
          </p>
          {badge && (
            <span className="shrink-0 rounded-[4px] bg-[#EAECF0] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-grey-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="truncate text-[13px] font-medium leading-tight text-[#96999D]">
          {email}
        </p>
      </div>
    </div>
  );
}

function ClientRow({
  client,
  striped,
  onEdit,
  onDelete,
  onReactivate,
  reactivating,
}: {
  client: Client;
  striped: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReactivate: () => void;
  reactivating: boolean;
}) {
  const isSelfDeleted = client.selfDeletedAt !== null;
  const isDeactivated = client.deactivatedAt !== null;
  const isDimmed = isSelfDeleted || isDeactivated;
  const badge = isSelfDeleted
    ? "Удалил аккаунт"
    : isDeactivated
      ? "Деактивирован"
      : undefined;
  return (
    <div
      className={clsx(
        "flex items-center gap-6 border-b border-[#EAECF0] px-6 py-3",
        striped && "bg-grey-lighter",
        isDimmed && "opacity-60",
      )}
    >
      <div className="w-[280px]">
        <PersonCell
          firstName={client.firstName}
          lastName={client.lastName}
          email={client.email}
          avatarUrl={client.avatarUrl}
          badge={badge}
        />
      </div>
      <div className="w-[280px]">
        {client.manager ? (
          <PersonCell
            firstName={client.manager.firstName}
            lastName={client.manager.lastName}
            email={client.manager.email}
            avatarUrl={client.manager.avatarUrl}
          />
        ) : (
          <span className="text-[14px] text-grey-medium">—</span>
        )}
      </div>
      <div className="flex-1">
        <CategoryBadge category={client.clientCategory} />
      </div>
      <div className="flex w-[200px] shrink-0 items-center justify-end gap-2">
        {isDeactivated ? (
          <button
            type="button"
            onClick={onReactivate}
            disabled={reactivating}
            className="flex cursor-pointer items-center gap-1.5 rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={16} strokeWidth={2} />
            {reactivating ? "Восстановление…" : "Восстановить"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
            >
              Редактировать
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Удалить клиента"
              className="cursor-pointer rounded-[8px] p-2 text-grey-dark hover:bg-grey-lighter transition-colors"
            >
              <Trash2 size={20} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
