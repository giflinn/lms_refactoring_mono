import { useEffect, useState } from "react";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Toggle } from "../../../components/ui/Toggle";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import {
  ApiError,
  type ClientCategory,
  type Notification,
  type NotificationInput,
  type RecurrenceUnit,
  type Weekday,
} from "../api";
import {
  useCreateNotification,
  useUpdateNotification,
} from "../queries";
import { weekdayShort, WEEKDAY_ORDER } from "../format";

type Props = {
  open: boolean;
  // When set, drawer is in edit mode and submits PATCH.
  notification: Notification | null;
  // When set (and notification is null), drawer is in create mode but
  // prefilled from this row — used by "Дублировать" on completed cards.
  // Dates are intentionally cleared so the user picks new ones.
  template?: Notification | null;
  onClose: () => void;
};

type FormState = {
  title: string;
  body: string;
  category: ClientCategory | null;
  sendNow: boolean;
  date: string;
  time: string;
  recurring: boolean;
  endDate: string;
  recurrenceInterval: number;
  recurrenceUnit: RecurrenceUnit;
  weekdays: Weekday[];
};

const EMPTY: FormState = {
  title: "",
  body: "",
  category: null,
  sendNow: false,
  date: "",
  time: "",
  recurring: false,
  endDate: "",
  recurrenceInterval: 1,
  recurrenceUnit: "week",
  weekdays: [],
};

const CATEGORY_OPTIONS: { value: ClientCategory | "_all"; label: string }[] = [
  { value: "_all", label: "Всем клиентам" },
  { value: "vip", label: "VIP" },
  { value: "new", label: "Новые" },
  { value: "regular", label: "Постоянные" },
];

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "week", label: "Неделю" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

const MAX_INTERVAL: Record<RecurrenceUnit, number> = {
  week: 52,
  month: 12,
  year: 10,
};

const UNIT_MS: Record<RecurrenceUnit, number> = {
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

const ERROR_MESSAGES: Record<string, string> = {
  title_required: "Введите название",
  title_too_long: "Слишком длинное название",
  body_required: "Введите текст уведомления",
  body_too_long: "Слишком длинный текст",
  invalid_category: "Неверная категория",
  send_now_with_recurring: "Нельзя отправить сейчас регулярную нотификацию",
  starts_at_required: "Укажите дату и время начала",
  invalid_ends_at: "Неверная дата конца",
  ends_at_before_starts_at: "Дата конца раньше даты начала",
  invalid_recurrence_unit: "Выберите единицу повторения",
  invalid_recurrence_interval: "Неверный интервал",
  invalid_recurrence_byweekday: "Выберите дни недели",
  scheduled_at_required: "Укажите дату и время",
  no_future_fires: "Нет будущих срабатываний — проверьте даты",
};

export function NotificationDrawer({
  open,
  notification,
  template,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [generalError, setGeneralError] = useState<string | undefined>();
  const create = useCreateNotification();
  const update = useUpdateNotification();
  const isEdit = notification !== null;

  useEffect(() => {
    if (!open) return;
    setGeneralError(undefined);
    if (notification) {
      setForm(toFormState(notification));
    } else if (template) {
      setForm(toFormStateAsTemplate(template));
    } else {
      setForm(EMPTY);
    }
  }, [open, notification, template]);

  function update_<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleWeekday(d: Weekday) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d)
        ? f.weekdays.filter((x) => x !== d)
        : [...f.weekdays, d],
    }));
  }

  const rangeWarning = computeRangeWarning(form);
  const isValid = isFormValid(form) && !rangeWarning;
  const submitting = create.isPending || update.isPending;
  const intervalMax = MAX_INTERVAL[form.recurrenceUnit];

  async function handleSubmit() {
    setGeneralError(undefined);
    const input = formToInput(form);
    try {
      if (notification) {
        await update.mutateAsync({ id: notification.id, input });
      } else {
        await create.mutateAsync(input);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(ERROR_MESSAGES[err.code] ?? "Не удалось сохранить");
      } else {
        setGeneralError("Нет соединения с сервером");
      }
    }
  }

  return (
    <Drawer
      open={open}
      title={
        isEdit
          ? "Редактировать нотификацию"
          : template
            ? "Дублировать нотификацию"
            : "Добавить нотификацию"
      }
      onClose={onClose}
      footer={
        <Button onClick={handleSubmit} disabled={!isValid || submitting}>
          {submitting
            ? "Сохранение…"
            : isEdit
              ? "Сохранить"
              : "Добавить нотификацию"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        <Input
          label="Название"
          fullWidth
          value={form.title}
          onChange={(e) => update_("title", e.target.value)}
          maxLength={200}
          onClear={() => update_("title", "")}
        />

        <Textarea
          label="Текст нотификации"
          rows={5}
          maxLength={2000}
          value={form.body}
          onChange={(e) => update_("body", e.target.value)}
        />

        <Select<ClientCategory | "_all">
          label="Категория клиента"
          value={form.category ?? "_all"}
          onChange={(v) =>
            update_("category", v === "_all" || v === null ? null : v)
          }
          options={CATEGORY_OPTIONS}
          placeholder="Выберите категорию"
        />

        <ToggleRow
          label="Регулярно повторять"
          checked={form.recurring}
          onChange={(v) => {
            setForm((f) => ({
              ...f,
              recurring: v,
              sendNow: v ? false : f.sendNow,
            }));
          }}
        />

        {!form.recurring && (
          <ToggleRow
            label="Отправить сейчас"
            checked={form.sendNow}
            onChange={(v) => update_("sendNow", v)}
          />
        )}

        {!form.sendNow && (
          <div className="flex gap-2">
            <DateField
              label={form.recurring ? "Дата начала" : "Дата"}
              value={form.date}
              onChange={(v) => update_("date", v)}
            />
            <TimeField
              label={form.recurring ? "Время" : "Время"}
              value={form.time}
              onChange={(v) => update_("time", v)}
            />
          </div>
        )}

        {form.recurring && (
          <>
            <DateField
              label="Дата конца (опционально)"
              value={form.endDate}
              onChange={(v) => update_("endDate", v)}
            />

            <div className="flex flex-col gap-1">
              <span className="py-1 text-[14px] font-medium text-grey-dark">
                Повторять каждые
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={intervalMax}
                  value={form.recurrenceInterval}
                  onChange={(e) =>
                    update_(
                      "recurrenceInterval",
                      Math.min(
                        intervalMax,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    )
                  }
                  className="h-9 w-[80px] rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
                />
                <Select<RecurrenceUnit>
                  value={form.recurrenceUnit}
                  onChange={(v) => {
                    const unit = v ?? "week";
                    setForm((f) => ({
                      ...f,
                      recurrenceUnit: unit,
                      recurrenceInterval: Math.min(
                        f.recurrenceInterval,
                        MAX_INTERVAL[unit],
                      ),
                    }));
                  }}
                  options={UNIT_OPTIONS}
                  className="flex-1"
                />
              </div>
              {rangeWarning && (
                <p className="text-[13px] text-red-error">{rangeWarning}</p>
              )}
            </div>

            {form.recurrenceUnit === "week" && (
              <div className="flex flex-col gap-1">
                <span className="py-1 text-[14px] font-medium text-grey-dark">
                  Повторять по
                </span>
                <div className="flex flex-wrap items-start gap-2">
                  {WEEKDAY_ORDER.map((d) => {
                    const active = form.weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWeekday(d)}
                        style={{ width: 44, height: 44 }}
                        className={clsx(
                          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border text-[14px] font-medium transition-colors",
                          active
                            ? "border-purple-primary bg-purple-primary text-white"
                            : "border-[#EAECF0] text-grey-medium hover:border-grey-medium",
                        )}
                      >
                        {weekdayShort(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {generalError && (
          <p className="text-[13px] text-red-error">{generalError}</p>
        )}
      </div>
    </Drawer>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="text-[14px] font-medium text-grey-dark">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="py-1 text-[14px] font-medium text-grey-dark">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
      />
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="py-1 text-[14px] font-medium text-grey-dark">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
      />
    </label>
  );
}

// Approximate guardrail: if an end date is set and the interval ×
// unit-duration is wider than the range, the rule produces only the initial
// fire (or none, if startsAt is past). Approximation uses average days per
// month/year — exact "next fire" math lives on the server. The warning is
// here to catch obvious nonsense like "every 17 weeks" within a 1-month range.
function computeRangeWarning(f: FormState): string | null {
  if (!f.recurring || !f.date || !f.endDate) return null;
  const startMs = new Date(`${f.date}T${f.time || "00:00"}:00`).getTime();
  const endMs = new Date(`${f.endDate}T${f.time || "00:00"}:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  if (endMs <= startMs) return null;
  const span = endMs - startMs;
  if (f.recurrenceInterval * UNIT_MS[f.recurrenceUnit] > span) {
    return "Интервал больше периода — повторений не будет.";
  }
  return null;
}

function isFormValid(f: FormState): boolean {
  if (!f.title.trim()) return false;
  if (!f.body.trim()) return false;
  if (f.recurring) {
    if (!f.date || !f.time) return false;
    if (!f.recurrenceInterval || f.recurrenceInterval < 1) return false;
    if (f.recurrenceUnit === "week" && f.weekdays.length === 0) return false;
    return true;
  }
  if (f.sendNow) return true;
  return Boolean(f.date && f.time);
}

function combineDateTime(date: string, time: string): string {
  // Browser-local date+time → ISO. Backend stores as UTC; the conversion
  // here is what makes "15:00 в Алматы" land as 10:00Z in the column.
  return new Date(`${date}T${time}:00`).toISOString();
}

function formToInput(f: FormState): NotificationInput {
  if (f.recurring) {
    return {
      title: f.title.trim(),
      body: f.body.trim(),
      category: f.category,
      sendNow: false,
      scheduledAt: null,
      recurring: true,
      startsAt: combineDateTime(f.date, f.time),
      endsAt: f.endDate ? combineDateTime(f.endDate, f.time) : null,
      recurrenceUnit: f.recurrenceUnit,
      recurrenceInterval: f.recurrenceInterval,
      recurrenceByweekday:
        f.recurrenceUnit === "week" && f.weekdays.length > 0
          ? f.weekdays
          : null,
    };
  }
  return {
    title: f.title.trim(),
    body: f.body.trim(),
    category: f.category,
    sendNow: f.sendNow,
    scheduledAt: f.sendNow ? null : combineDateTime(f.date, f.time),
    recurring: false,
    startsAt: null,
    endsAt: null,
    recurrenceUnit: null,
    recurrenceInterval: null,
    recurrenceByweekday: null,
  };
}

// Prefill from a completed (or any) notification but blank out the date
// fields — Дублировать always asks the user to pick a new schedule, since
// the source row's dates are stale.
function toFormStateAsTemplate(n: Notification): FormState {
  const base = toFormState(n);
  return {
    ...base,
    date: "",
    time: "",
    endDate: "",
    sendNow: false,
  };
}

function toFormState(n: Notification): FormState {
  if (n.isRecurring && n.startsAt) {
    const start = new Date(n.startsAt);
    return {
      title: n.title,
      body: n.body,
      category: n.category,
      sendNow: false,
      date: toDateInput(start),
      time: toTimeInput(start),
      recurring: true,
      endDate: n.endsAt ? toDateInput(new Date(n.endsAt)) : "",
      recurrenceInterval: n.recurrenceInterval ?? 1,
      recurrenceUnit: n.recurrenceUnit ?? "week",
      weekdays: n.recurrenceByweekday ?? [],
    };
  }
  if (n.scheduledAt) {
    const at = new Date(n.scheduledAt);
    return {
      ...EMPTY,
      title: n.title,
      body: n.body,
      category: n.category,
      date: toDateInput(at),
      time: toTimeInput(at),
    };
  }
  return EMPTY;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
