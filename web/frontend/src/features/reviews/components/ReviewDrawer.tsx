import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer } from "../../../components/ui/Drawer";
import { Avatar } from "../../../components/Avatar";
import { Textarea } from "../../../components/ui/Textarea";
import { Button } from "../../../components/ui/Button";
import { formatOrderDate } from "../../orders/format";
import type { ReviewListItem } from "../api";
import { ReviewStatusBadge } from "./StatusBadge";
import { StarRating } from "./StarRating";
import {
  useDeleteReviewReply,
  useModerateReview,
  useReplyToReview,
} from "../queries";

type Props = {
  review: ReviewListItem | null;
  open: boolean;
  onClose: () => void;
};

export function ReviewDrawer({ review, open, onClose }: Props) {
  const moderate = useModerateReview();
  const reply = useReplyToReview();
  const deleteReply = useDeleteReviewReply();

  const [replyText, setReplyText] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Local optimistic copy so the drawer keeps showing fresh state after
  // mutations without forcing a refetch of the whole list before updating.
  const [localReplies, setLocalReplies] = useState<
    ReviewListItem["replies"]
  >([]);
  const [localStatus, setLocalStatus] = useState<
    ReviewListItem["status"] | null
  >(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Sync local state whenever a different review is opened.
  useEffect(() => {
    if (review) {
      setLocalReplies(review.replies);
      setLocalStatus(review.status);
      setReplyText("");
      setErrorCode(null);
    }
  }, [review?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!review) {
    return (
      <Drawer open={open} title="Отзыв" onClose={onClose}>
        <div className="py-12 text-center text-[14px] text-grey-medium">
          Загрузка…
        </div>
      </Drawer>
    );
  }

  const currentStatus = localStatus ?? review.status;
  const isPending = currentStatus === "pending";

  async function handleModerate(action: "publish" | "delete") {
    setErrorCode(null);
    try {
      await moderate.mutateAsync({ id: review!.id, action });
      setLocalStatus(action === "publish" ? "published" : "deleted");
    } catch (err) {
      setErrorCode(extractCode(err));
    }
  }

  async function handleReply() {
    const text = replyText.trim();
    if (!text) return;
    setErrorCode(null);
    try {
      const created = await reply.mutateAsync({ id: review!.id, text });
      // Push optimistic row using the logged-in actor — we don't have their
      // profile here, so the row uses placeholder strings; the next list
      // refetch will replace it with the real author summary.
      setLocalReplies((prev) => [
        ...prev,
        {
          id: created.id,
          text,
          createdAt: new Date().toISOString(),
          author: {
            id: "self",
            firstName: "Вы",
            lastName: "",
            avatarUrl: null,
          },
        },
      ]);
      setReplyText("");
    } catch (err) {
      setErrorCode(extractCode(err));
    }
  }

  async function handleDeleteReply(replyId: string) {
    setErrorCode(null);
    try {
      await deleteReply.mutateAsync({ replyId });
      setLocalReplies((prev) => prev.filter((r) => r.id !== replyId));
    } catch (err) {
      setErrorCode(extractCode(err));
    }
  }

  return (
    <Drawer open={open} title="Отзыв" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-6">
        <Section label="Дата">
          <span className="text-[14px] text-[#0E131F]">
            {formatOrderDate(review.createdAt)}
          </span>
        </Section>

        <Section label="Клиент">
          <PersonRow
            firstName={review.client.firstName}
            lastName={review.client.lastName}
            avatarUrl={review.client.avatarUrl}
          />
        </Section>

        <Section label="Товар">
          <span className="text-[14px] font-medium text-[#0E131F]">
            {review.product.title}
          </span>
        </Section>

        <Section label="Оценка">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} size={20} />
            <span className="text-[14px] font-medium text-[#0E131F]">
              {review.rating}/5
            </span>
          </div>
        </Section>

        <Section label="Статус">
          <ReviewStatusBadge status={currentStatus} />
        </Section>

        <Section label="Текст отзыва">
          <div className="rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3 text-[14px] leading-relaxed text-[#0E131F] whitespace-pre-wrap">
            {review.text}
          </div>
        </Section>

        <Section label={`Ответы (${localReplies.length})`}>
          {localReplies.length === 0 ? (
            <span className="text-[14px] text-grey-medium">Пока нет ответов</span>
          ) : (
            <div className="flex flex-col gap-2">
              {localReplies.map((r) => (
                <ReplyCard
                  key={r.id}
                  reply={r}
                  onDelete={() => handleDeleteReply(r.id)}
                  deleting={deleteReply.isPending}
                />
              ))}
            </div>
          )}
        </Section>

        <Section label="Добавить ответ">
          <Textarea
            ref={replyRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Напишите ответ от лица команды…"
            rows={3}
            maxLength={2000}
          />
          <Button
            onClick={handleReply}
            disabled={!replyText.trim() || reply.isPending}
            className="mt-2"
          >
            {reply.isPending ? "Отправка…" : "Отправить ответ"}
          </Button>
        </Section>

        {isPending && (
          <Section label="Модерация">
            <div className="flex gap-2">
              <Button
                onClick={() => handleModerate("publish")}
                disabled={moderate.isPending}
              >
                {moderate.isPending ? "Сохранение…" : "Опубликовать"}
              </Button>
              <button
                type="button"
                onClick={() => handleModerate("delete")}
                disabled={moderate.isPending}
                className="flex h-9 w-full items-center justify-center rounded-[8px] border border-red-error/40 bg-red-error/5 px-6 text-[14px] font-medium text-red-error transition-colors hover:bg-red-error/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          </Section>
        )}

        {currentStatus === "published" && (
          <Section label="Модерация">
            <button
              type="button"
              onClick={() => handleModerate("delete")}
              disabled={moderate.isPending}
              className="flex h-9 w-full items-center justify-center rounded-[8px] border border-red-error/40 bg-red-error/5 px-6 text-[14px] font-medium text-red-error transition-colors hover:bg-red-error/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Снять с публикации
            </button>
          </Section>
        )}

        {errorCode && (
          <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-3 text-[13px] text-red-error">
            {friendlyError(errorCode)}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function extractCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return "unknown_error";
}

function friendlyError(code: string): string {
  switch (code) {
    case "review_not_found":
      return "Отзыв не найден.";
    case "review_deleted":
      return "Отзыв уже удалён.";
    case "review_not_published":
      return "На неопубликованный отзыв нельзя ответить.";
    case "forbidden":
      return "Нет прав на это действие.";
    case "missing_fields":
      return "Введите текст ответа.";
    default:
      return "Не удалось сохранить. Попробуйте ещё раз.";
  }
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="py-1 text-[14px] font-medium text-grey-dark">
        {label}
      </span>
      {children}
    </div>
  );
}

function PersonRow({
  firstName,
  lastName,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        src={avatarUrl}
        firstName={firstName}
        lastName={lastName}
        size={40}
      />
      <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
        {firstName} {lastName}
      </p>
    </div>
  );
}

function ReplyCard({
  reply,
  onDelete,
  deleting,
}: {
  reply: ReviewListItem["replies"][number];
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            src={reply.author.avatarUrl}
            firstName={reply.author.firstName}
            lastName={reply.author.lastName}
            size={28}
          />
          <span className="truncate text-[13px] font-medium text-[#0E131F]">
            {reply.author.firstName} {reply.author.lastName}
          </span>
          <span className="text-[12px] text-grey-medium whitespace-nowrap">
            {formatOrderDate(reply.createdAt)}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Удалить ответ"
          className="text-grey-medium hover:text-red-error transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
      <p className="text-[14px] leading-relaxed text-[#0E131F] whitespace-pre-wrap">
        {reply.text}
      </p>
    </div>
  );
}
