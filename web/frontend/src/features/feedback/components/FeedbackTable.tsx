import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { FeedbackListItem } from "../api";
import { FeedbackStatusBadge } from "./StatusBadge";
import { formatOrderDate } from "../../orders/format";

type Props = {
  feedback: FeedbackListItem[];
  onOpen: (item: FeedbackListItem) => void;
};

export function FeedbackTable({ feedback, onOpen }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center bg-background text-[14px] font-medium text-grey-dark">
        <div className="flex flex-1 items-center gap-4 px-4 py-3">
          <div className="w-[150px]">Дата</div>
          <div className="min-w-0 max-w-[280px] flex-1 basis-[220px]">Клиент</div>
          <div className="min-w-0 flex-[2] basis-[280px]">Сообщение</div>
          <div className="w-[140px]">Статус</div>
          <div className="w-[140px]" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col">
        {feedback.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет сообщений обратной связи
          </div>
        ) : (
          feedback.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              striped={i % 2 === 1}
              onOpen={() => onOpen(item)}
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
  item,
  striped,
  onOpen,
}: {
  item: FeedbackListItem;
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
      <div className="flex flex-1 items-center gap-4 px-4 py-3 text-[13px] text-grey-dark">
        <div className="w-[150px]">{formatOrderDate(item.createdAt)}</div>
        <div className="min-w-0 max-w-[280px] flex-1 basis-[220px]">
          <PersonCell
            firstName={item.client.firstName}
            lastName={item.client.lastName}
            email={item.client.email}
            avatarUrl={item.client.avatarUrl}
          />
        </div>
        <div className="min-w-0 flex-[2] basis-[280px]">
          <p className="line-clamp-2 text-[14px] leading-tight text-[#0E131F]">
            {item.bodySnippet}
          </p>
        </div>
        <div className="flex w-[140px]">
          <FeedbackStatusBadge status={item.status} />
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
