import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { CancellationListItem } from "../api";
import { CancellationStatusBadge } from "./StatusBadge";
import { formatOrderDate } from "../../orders/format";

type Props = {
  cancellations: CancellationListItem[];
  onOpen: (c: CancellationListItem) => void;
};

export function CancellationsTable({ cancellations, onOpen }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center bg-background text-[14px] font-medium text-grey-dark">
        <div className="w-[110px] border-r border-[#EAECF0] bg-[#F9F9F9] px-4 py-3">
          № Заказа
        </div>
        <div className="flex flex-1 items-center gap-4 px-4 py-3">
          <div className="w-[150px]">Дата</div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
            Клиент
          </div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
            Менеджер
          </div>
          <div aria-hidden className="flex-1" />
          <div className="w-[140px]">Статус</div>
          <div className="w-[140px]" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col">
        {cancellations.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет запросов на отмену
          </div>
        ) : (
          cancellations.map((c, i) => (
            <Row
              key={c.id}
              cancellation={c}
              striped={i % 2 === 1}
              onOpen={() => onOpen(c)}
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
}: {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
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
        <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
          {firstName} {lastName}
        </p>
        <p className="truncate text-[13px] font-medium leading-tight text-[#96999D]">
          {email}
        </p>
      </div>
    </div>
  );
}

function Row({
  cancellation,
  striped,
  onOpen,
}: {
  cancellation: CancellationListItem;
  striped: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={clsx(
        "flex items-center border-b border-[#EAECF0]",
        striped && "bg-[#FBFBFB]",
      )}
    >
      <div className="w-[110px] self-stretch border-r border-[#EAECF0] bg-white px-4 py-3 text-[14px] font-medium text-[#0E131F] flex items-center">
        {cancellation.orderNumber}
      </div>
      <div className="flex flex-1 items-center gap-4 px-4 py-3 text-[13px] text-grey-dark">
        <div className="w-[150px]">
          {formatOrderDate(cancellation.createdAt)}
        </div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
          <PersonCell
            firstName={cancellation.client.firstName}
            lastName={cancellation.client.lastName}
            email={cancellation.client.email}
            avatarUrl={cancellation.client.avatarUrl}
          />
        </div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
          {cancellation.manager ? (
            <PersonCell
              firstName={cancellation.manager.firstName}
              lastName={cancellation.manager.lastName}
              email={cancellation.manager.email}
              avatarUrl={cancellation.manager.avatarUrl}
            />
          ) : (
            <span className="text-grey-medium">—</span>
          )}
        </div>
        <div aria-hidden className="flex-1" />
        <div className="flex w-[140px]">
          <CancellationStatusBadge status={cancellation.status} />
        </div>
        <div className="flex w-[140px]">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
          >
            Просмотреть
          </button>
        </div>
      </div>
    </div>
  );
}
