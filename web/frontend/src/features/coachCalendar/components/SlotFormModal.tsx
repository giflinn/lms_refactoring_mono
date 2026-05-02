import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { ApiError, type CoachSlot, type SlotType } from "../api";
import {
  useCreateCoachSlot,
  useDeleteCoachSlot,
  useUpdateCoachSlot,
} from "../queries";
import { mapError } from "../errors";
import {
  combineLocalDateTime,
  formatLongDate,
  toDateInputValue,
  toTimeInputValue,
} from "../lib/dates";

type Mode =
  | { kind: "create"; preset: { day: Date; hour: number } | null }
  | { kind: "edit"; slot: CoachSlot };

type Props = {
  open: boolean;
  mode: Mode | null;
  slotTypes: SlotType[];
  onClose: () => void;
};

type FieldErrors = {
  slotTypeId?: string;
  date?: string;
  startsAt?: string;
  endsAt?: string;
};

export function SlotFormModal({ open, mode, slotTypes, onClose }: Props) {
  const create = useCreateCoachSlot();
  const update = useUpdateCoachSlot();
  const remove = useDeleteCoachSlot();

  const [slotTypeId, setSlotTypeId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();

  // Reset form whenever the modal opens with a new mode. The dependencies are
  // mode + slotTypes so an edit modal re-syncs if the slot is replaced.
  useEffect(() => {
    if (!open || !mode) return;
    setFieldErrors({});
    setGeneralError(undefined);
    if (mode.kind === "edit") {
      const start = new Date(mode.slot.startsAt);
      const end = new Date(mode.slot.endsAt);
      setSlotTypeId(mode.slot.slotTypeId);
      setDate(toDateInputValue(start));
      setStartTime(toTimeInputValue(start));
      setEndTime(toTimeInputValue(end));
      return;
    }
    if (mode.preset) {
      const day = mode.preset.day;
      const startHour = mode.preset.hour;
      setSlotTypeId(slotTypes[0]?.id ?? "");
      setDate(toDateInputValue(day));
      setStartTime(`${String(startHour).padStart(2, "0")}:00`);
      setEndTime(`${String(Math.min(startHour + 1, 23)).padStart(2, "0")}:00`);
      return;
    }
    setSlotTypeId(slotTypes[0]?.id ?? "");
    const now = new Date();
    setDate(toDateInputValue(now));
    setStartTime("");
    setEndTime("");
  }, [open, mode, slotTypes]);

  const title = mode?.kind === "edit" ? "Редактирование слота" : "Новый слот";
  const subtitle = useMemo(() => {
    if (!date) return "";
    const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dm) return "";
    const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
    return formatLongDate(d);
  }, [date]);

  function validate(): {
    starts: Date;
    ends: Date;
    typeId: string;
  } | null {
    const errors: FieldErrors = {};
    if (!slotTypeId) errors.slotTypeId = "Выберите тип слота.";
    if (!date) errors.date = "Выберите дату.";
    if (!startTime) errors.startsAt = "Укажите время начала.";
    if (!endTime) errors.endsAt = "Укажите время окончания.";
    const starts = combineLocalDateTime(date, startTime);
    const ends = combineLocalDateTime(date, endTime);
    if (date && startTime && !starts) errors.startsAt = "Некорректное время.";
    if (date && endTime && !ends) errors.endsAt = "Некорректное время.";
    if (starts && ends && ends <= starts) {
      errors.endsAt = "Время окончания должно быть позже начала.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !starts || !ends) return null;
    return { starts, ends, typeId: slotTypeId };
  }

  function applyApiError(err: unknown) {
    if (err instanceof ApiError) {
      const mapped = mapError(err.code);
      const fields: FieldErrors = {};
      if (mapped.fields.slotTypeId) fields.slotTypeId = mapped.fields.slotTypeId;
      if (mapped.fields.startsAt) fields.startsAt = mapped.fields.startsAt;
      if (mapped.fields.endsAt) fields.endsAt = mapped.fields.endsAt;
      setFieldErrors(fields);
      setGeneralError(mapped.general);
    } else {
      setGeneralError("Нет соединения с сервером.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError(undefined);
    const v = validate();
    if (!v) return;
    try {
      if (mode?.kind === "edit") {
        await update.mutateAsync({
          id: mode.slot.id,
          input: {
            slotTypeId: v.typeId,
            startsAt: v.starts.toISOString(),
            endsAt: v.ends.toISOString(),
          },
        });
      } else {
        await create.mutateAsync({
          slotTypeId: v.typeId,
          startsAt: v.starts.toISOString(),
          endsAt: v.ends.toISOString(),
        });
      }
      onClose();
    } catch (err) {
      applyApiError(err);
    }
  }

  async function handleCancelSlot() {
    if (mode?.kind !== "edit") return;
    setGeneralError(undefined);
    try {
      await remove.mutateAsync(mode.slot.id);
      onClose();
    } catch (err) {
      applyApiError(err);
    }
  }

  const pending = create.isPending || update.isPending || remove.isPending;
  const isEdit = mode?.kind === "edit";

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose}>
      <form
        onSubmit={handleSubmit}
        className="flex w-[460px] flex-col gap-4 p-6"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-[16px] font-semibold text-[#0E131F]">{title}</h3>
          {subtitle && (
            <p className="text-[12px] text-grey-medium">{subtitle}</p>
          )}
        </div>

        <Field label="Тип слота" error={fieldErrors.slotTypeId}>
          <select
            value={slotTypeId}
            onChange={(e) => {
              setSlotTypeId(e.target.value);
              setFieldErrors((prev) => ({ ...prev, slotTypeId: undefined }));
            }}
            className="h-10 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
          >
            <option value="" disabled>
              Выберите тип
            </option>
            {slotTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Дата" error={fieldErrors.date}>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFieldErrors((prev) => ({ ...prev, date: undefined }));
            }}
            className="h-10 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало" error={fieldErrors.startsAt}>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setFieldErrors((prev) => ({ ...prev, startsAt: undefined }));
              }}
              className="h-10 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
            />
          </Field>
          <Field label="Конец" error={fieldErrors.endsAt}>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setFieldErrors((prev) => ({ ...prev, endsAt: undefined }));
              }}
              className="h-10 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
            />
          </Field>
        </div>

        {generalError && (
          <p className="text-[13px] text-red-error">{generalError}</p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={handleCancelSlot}
              disabled={pending}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-red-error/40 bg-white px-3 text-[13px] font-medium text-red-error hover:bg-red-error/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={16} strokeWidth={1.7} />
              Отменить слот
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-10 cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 text-[14px] font-medium text-[#0E131F] disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 cursor-pointer rounded-[8px] bg-purple-primary px-4 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? "Сохранение…"
                : isEdit
                  ? "Сохранить"
                  : "Создать"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-grey-medium">{label}</span>
      {children}
      {error && <span className="text-[12px] text-red-error">{error}</span>}
    </label>
  );
}
