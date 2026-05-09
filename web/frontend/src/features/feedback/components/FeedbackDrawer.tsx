import { useEffect, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/ui/Button";
import { useFeedbackDetail, useUpdateFeedback } from "../queries";
import type { FeedbackStatus } from "../api";
import {
  FeedbackStatusBadge,
  feedbackStatusLabel,
} from "./StatusBadge";
import { formatOrderDate } from "../../orders/format";

type Props = {
  feedbackId: string | null;
  open: boolean;
  onClose: () => void;
};

export function FeedbackDrawer({ feedbackId, open, onClose }: Props) {
  const query = useFeedbackDetail(open ? feedbackId : null);
  const update = useUpdateFeedback();

  const [note, setNote] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Reset transient state on open/close.
  useEffect(() => {
    if (!open) setErrorCode(null);
  }, [open]);

  // Pre-fill the note with what's saved so re-opening keeps context.
  useEffect(() => {
    setNote(query.data?.adminNote ?? "");
  }, [query.data?.id, query.data?.adminNote]);

  const fb = query.data;
  const noteDirty = fb ? note.trim() !== (fb.adminNote ?? "") : false;
  const isLoading = open && query.isLoading;
  const isError = open && query.isError;

  async function changeStatus(next: FeedbackStatus) {
    if (!fb || fb.status === next) return;
    setErrorCode(null);
    try {
      await update.mutateAsync({ id: fb.id, status: next });
    } catch (err) {
      setErrorCode(extractCode(err));
    }
  }

  async function saveNote() {
    if (!fb) return;
    setErrorCode(null);
    try {
      await update.mutateAsync({
        id: fb.id,
        adminNote: note.trim() === "" ? null : note.trim(),
      });
    } catch (err) {
      setErrorCode(extractCode(err));
    }
  }

  return (
    <Drawer open={open} title="Обратная связь" onClose={onClose}>
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
      {fb && (
        <div className="flex flex-col gap-4 pb-6">
          <Section label="Дата">
            <span className="text-[14px] text-[#0E131F]">
              {formatOrderDate(fb.createdAt)}
            </span>
          </Section>

          <Section label="Клиент">
            <PersonRow
              firstName={fb.client.firstName}
              lastName={fb.client.lastName}
              email={fb.client.email}
              avatarUrl={fb.client.avatarUrl}
              extra={fb.client.phone ?? undefined}
            />
          </Section>

          <Section label="Менеджер">
            {fb.manager ? (
              <PersonRow
                firstName={fb.manager.firstName}
                lastName={fb.manager.lastName}
                email={fb.manager.email}
                avatarUrl={fb.manager.avatarUrl}
              />
            ) : (
              <span className="text-[14px] text-grey-medium">—</span>
            )}
          </Section>

          <Section label="Статус">
            <div className="flex items-center gap-3">
              <FeedbackStatusBadge status={fb.status} />
              {fb.resolvedAt && (
                <span className="text-[13px] text-grey-medium">
                  {formatOrderDate(fb.resolvedAt)}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {fb.status === "new" && (
                <Button
                  onClick={() => changeStatus("in_progress")}
                  disabled={update.isPending}
                  className="!w-auto"
                >
                  Принять в работу
                </Button>
              )}
              {fb.status !== "resolved" && (
                <Button
                  onClick={() => changeStatus("resolved")}
                  disabled={update.isPending}
                  className="!w-auto"
                >
                  Отметить решённым
                </Button>
              )}
              {fb.status === "resolved" && (
                <button
                  type="button"
                  onClick={() => changeStatus("in_progress")}
                  disabled={update.isPending}
                  className="flex h-9 items-center justify-center rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-6 text-[14px] font-medium text-grey-dark transition-colors hover:bg-grey-lighter disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Вернуть в работу
                </button>
              )}
            </div>
          </Section>

          <Section label="Сообщение клиента">
            <div className="rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3 text-[14px] leading-relaxed text-[#0E131F] whitespace-pre-wrap">
              {fb.body}
            </div>
          </Section>

          <Section label="Внутренняя заметка">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Видна только команде"
              maxLength={2000}
              rows={4}
              className="w-full resize-none rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white p-3 text-[14px] text-[#0E131F] outline-none focus:border-purple-primary"
            />
            {noteDirty && (
              <div className="mt-2 flex justify-end">
                <Button
                  onClick={saveNote}
                  disabled={update.isPending}
                  className="!w-auto"
                >
                  Сохранить заметку
                </Button>
              </div>
            )}
          </Section>

          <Section label="Источник">
            <div className="rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3 text-[13px] leading-relaxed text-grey-dark">
              <Meta
                label="Платформа"
                value={platformLabel(fb.clientPlatform)}
              />
              <Meta
                label="Версия приложения"
                value={fb.clientAppVersion ?? "—"}
              />
            </div>
          </Section>

          {(fb.readBy || fb.resolvedBy) && (
            <Section label="История">
              <div className="flex flex-col gap-2 text-[13px] text-grey-dark">
                {fb.readBy && fb.readAt && (
                  <HistoryRow
                    label="Открыл первым"
                    date={fb.readAt}
                    name={`${fb.readBy.firstName} ${fb.readBy.lastName}`}
                  />
                )}
                {fb.resolvedBy && fb.resolvedAt && (
                  <HistoryRow
                    label={feedbackStatusLabel("resolved")}
                    date={fb.resolvedAt}
                    name={`${fb.resolvedBy.firstName} ${fb.resolvedBy.lastName}`}
                  />
                )}
              </div>
            </Section>
          )}

          {errorCode && (
            <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-3 text-[13px] text-red-error">
              {friendlyError(errorCode)}
            </div>
          )}
        </div>
      )}
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
    case "forbidden":
      return "Нет прав на это действие.";
    case "feedback_not_found":
      return "Запрос не найден.";
    default:
      return "Не удалось сохранить. Попробуйте ещё раз.";
  }
}

function platformLabel(value: string | null): string {
  if (value === "ios") return "iOS";
  if (value === "android") return "Android";
  return "—";
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-grey-medium">{label}</span>
      <span className="text-[#0E131F]">{value}</span>
    </div>
  );
}

function HistoryRow({
  label,
  date,
  name,
}: {
  label: string;
  date: string;
  name: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-grey-medium">
        {label} · {formatOrderDate(date)}
      </span>
      <span className="text-[#0E131F]">{name}</span>
    </div>
  );
}

function PersonRow({
  firstName,
  lastName,
  email,
  avatarUrl,
  extra,
}: {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  extra?: string;
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
          {extra ? ` · ${extra}` : ""}
        </p>
      </div>
    </div>
  );
}
