import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import { formatOrderDate } from "../../orders/format";
import type { ReviewListItem } from "../api";
import { ReviewStatusBadge } from "./StatusBadge";
import { StarRating } from "./StarRating";

type Props = {
  reviews: ReviewListItem[];
  onOpen: (r: ReviewListItem) => void;
};

export function ReviewsTable({ reviews, onOpen }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center bg-background text-[14px] font-medium text-grey-dark">
        <div className="flex flex-1 items-center gap-4 px-4 py-3">
          <div className="w-[150px]">Дата</div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[200px]">
            Клиент
          </div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[200px]">
            Товар
          </div>
          <div aria-hidden className="flex-1" />
          <div className="w-[110px]">Оценка</div>
          <div className="w-[150px]">Статус</div>
          <div className="w-[112px] shrink-0" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col">
        {reviews.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет отзывов
          </div>
        ) : (
          reviews.map((r, i) => (
            <Row
              key={r.id}
              review={r}
              striped={i % 2 === 1}
              onOpen={() => onOpen(r)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  review,
  striped,
  onOpen,
}: {
  review: ReviewListItem;
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
        <div className="w-[150px]">{formatOrderDate(review.createdAt)}</div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[200px]">
          <div className="flex items-center gap-3">
            <Avatar
              src={review.client.avatarUrl}
              firstName={review.client.firstName}
              lastName={review.client.lastName}
              size={36}
            />
            <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
              {review.client.firstName} {review.client.lastName}
            </p>
          </div>
        </div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[200px]">
          <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
            {review.product.title}
          </p>
        </div>
        <div aria-hidden className="flex-1" />
        <div className="w-[110px]">
          <StarRating rating={review.rating} />
        </div>
        <div className="flex w-[150px]">
          <ReviewStatusBadge status={review.status} />
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-3 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
          >
            Просмотреть
          </button>
        </div>
      </div>
    </div>
  );
}
