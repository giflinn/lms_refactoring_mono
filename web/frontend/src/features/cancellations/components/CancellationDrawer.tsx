import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Avatar } from "../../../components/Avatar";
import { useCancellation, useDecideCancellation } from "../queries";
import type { CancellationDecision, CancellationStatus } from "../api";
import { CancellationStatusMenu } from "./StatusMenu";
import {
  formatBookingRange,
  formatOrderDate,
  formatTenge,
} from "../../orders/format";

type Props = {
  cancellationId: string | null;
  open: boolean;
  onClose: () => void;
};

const STATUS_BADGE: Record<CancellationStatus, string> = {
  requested: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  approved: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  rejected: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

const STATUS_LABEL: Record<CancellationStatus, string> = {
  requested: "Запрошено",
  approved: "Одобрено",
  rejected: "Отказано",
};

export function CancellationDrawer({ cancellationId, open, onClose }: Props) {
  const query = useCancellation(open ? cancellationId : null);
  const decide = useDecideCancellation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Reset transient state on open/close.
  useEffect(() => {
    if (!open) {
      setMenuOpen(false);
      setErrorCode(null);
    }
  }, [open]);

  // Pre-fill the comment field with what's already saved (so editing stays
  // sensible when re-opening a decided row).
  useEffect(() => {
    setComment(query.data?.decisionComment ?? "");
  }, [query.data?.id, query.data?.decisionComment]);

  const cancellation = query.data;
  const isLoading = open && query.isLoading;
  const isError = open && query.isError;
  const isDecidable = cancellation?.status === "requested";

  async function applyDecision(decision: CancellationDecision) {
    if (!cancellation) return;
    setErrorCode(null);
    try {
      await decide.mutateAsync({
        id: cancellation.id,
        decision,
        comment: comment.trim() ? comment.trim() : null,
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "unknown_error";
      setErrorCode(code);
    }
  }

  const title = cancellation
    ? `Запрос на отмену заказа №${cancellation.orderNumber}`
    : "Запрос на отмену заказа";

  return (
    <>
      <Drawer
        open={open}
        title={title}
        onClose={onClose}
        footer={
          cancellation && (
            <div className="flex items-center justify-between text-[16px] font-medium">
              <span className="text-grey-dark">Сумма заказа</span>
              <span className="text-purple-primary">
                {formatTenge(cancellation.orderTotalTenge)}
              </span>
            </div>
          )
        }
      >
        {isLoading && (
          <div className="py-12 text-center text-[14px] text-grey-medium">
            Загрузка…
          </div>
        )}
        {isError && (
          <div className="py-12 text-center text-[14px] text-red-error">
            Не удалось загрузить запрос.
          </div>
        )}
        {cancellation && (
          <div className="flex flex-col gap-4 pb-6">
            <Section label="Дата запроса">
              <span className="text-[14px] text-[#0E131F]">
                {formatOrderDate(cancellation.createdAt)}
              </span>
            </Section>

            <Section label="Клиент">
              <PersonRow
                firstName={cancellation.client.firstName}
                lastName={cancellation.client.lastName}
                email={cancellation.client.email}
                avatarUrl={cancellation.client.avatarUrl}
              />
            </Section>

            <Section label="Менеджер">
              {cancellation.manager ? (
                <PersonRow
                  firstName={cancellation.manager.firstName}
                  lastName={cancellation.manager.lastName}
                  email={cancellation.manager.email}
                  avatarUrl={cancellation.manager.avatarUrl}
                />
              ) : (
                <span className="text-[14px] text-grey-medium">—</span>
              )}
            </Section>

            <Section label="Статус">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => isDecidable && setMenuOpen((v) => !v)}
                disabled={!isDecidable || decide.isPending}
                className={clsx(
                  "flex h-[44px] w-full items-center gap-3 rounded-[8px] border px-3 text-[14px] font-medium transition-opacity",
                  STATUS_BADGE[cancellation.status],
                  isDecidable
                    ? "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    : "cursor-default",
                )}
              >
                <span className="flex-1 text-left">
                  {STATUS_LABEL[cancellation.status]}
                </span>
                {cancellation.decidedAt && (
                  <span className="text-[13px] font-normal opacity-80">
                    {formatOrderDate(cancellation.decidedAt)}
                  </span>
                )}
                {isDecidable && <ChevronDown size={18} strokeWidth={1.5} />}
              </button>
            </Section>

            <Section label="Причина клиента">
              {cancellation.clientReason ? (
                <div className="rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3 text-[14px] leading-relaxed text-[#0E131F] whitespace-pre-wrap">
                  {cancellation.clientReason}
                </div>
              ) : (
                <span className="text-[14px] text-grey-medium">
                  Клиент не указал
                </span>
              )}
            </Section>

            <Section label="Комментарий менеджера">
              {isDecidable ? (
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Виден только команде"
                  maxLength={1000}
                  rows={4}
                  className="w-full resize-none rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white p-3 text-[14px] text-[#0E131F] outline-none focus:border-purple-primary"
                />
              ) : cancellation.decisionComment ? (
                <div className="rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3 text-[14px] leading-relaxed text-[#0E131F] whitespace-pre-wrap">
                  {cancellation.decisionComment}
                </div>
              ) : (
                <span className="text-[14px] text-grey-medium">—</span>
              )}
            </Section>

            {cancellation.decidedBy && (
              <Section label="Решение принял">
                <PersonRow
                  firstName={cancellation.decidedBy.firstName}
                  lastName={cancellation.decidedBy.lastName}
                  email={cancellation.decidedBy.email}
                  avatarUrl={cancellation.decidedBy.avatarUrl}
                />
              </Section>
            )}

            <Section label="Товары">
              <div className="flex flex-col gap-2">
                {cancellation.items.map((it) => (
                  <ItemCard
                    key={it.id}
                    chip={it.productCategoryName}
                    title={it.productTitle}
                    dateLabel={
                      it.bookedStart && it.bookedEnd
                        ? formatBookingRange(it.bookedStart, it.bookedEnd)
                        : it.expiresAt
                          ? `до ${formatOrderDate(it.expiresAt)}`
                          : (it.productSubtitle ?? "—")
                    }
                    price={formatTenge(it.unitPriceTenge)}
                  />
                ))}
              </div>
            </Section>

            {errorCode && (
              <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-3 text-[13px] text-red-error">
                {friendlyError(errorCode)}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {cancellation && (
        <CancellationStatusMenu
          open={menuOpen}
          triggerRef={triggerRef}
          onClose={() => setMenuOpen(false)}
          onSelect={(decision) => applyDecision(decision)}
        />
      )}
    </>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "cancellation_already_decided":
      return "Этот запрос уже обработан другим менеджером.";
    case "forbidden":
      return "Нет прав на это действие.";
    default:
      return "Не удалось сохранить решение. Попробуйте ещё раз.";
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
        size={40}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
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

function ItemCard({
  chip,
  title,
  dateLabel,
  price,
}: {
  chip: string;
  title: string;
  dateLabel: string;
  price: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3">
      <span className="inline-flex w-fit items-center rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-2.5 py-1 text-[12px] font-medium text-grey-medium">
        {chip}
      </span>
      <p className="text-[15px] font-medium text-grey-dark">{title}</p>
      <div className="h-px w-full bg-[#EAECF0]" />
      <div className="flex items-center justify-between text-[14px] font-medium">
        <span className="text-grey-dark/60">{dateLabel}</span>
        <span className="text-purple-primary">{price}</span>
      </div>
    </div>
  );
}
