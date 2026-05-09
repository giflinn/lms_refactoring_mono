import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { auth } from "../../../firebase";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select, type SelectOption } from "../../../components/ui/Select";
import {
  KaspiApiError,
  getKaspiSettings,
  saveKaspiSettings,
  type KaspiManagerSummary,
  type KaspiSettings,
  type KaspiStrategy,
} from "../api/kaspi";

const KAS_KEY = ["settings", "kaspi"] as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

type DraftGroup = {
  id: string | null;
  url: string;
  label: string;
  managerIds: string[];
};

type Draft = {
  strategy: KaspiStrategy;
  defaultUrl: string;
  groups: DraftGroup[];
};

export function KaspiSection() {
  const qc = useQueryClient();
  const settingsQ = useQuery<KaspiSettings>({
    queryKey: KAS_KEY,
    queryFn: async () => getKaspiSettings(await getIdToken()),
  });

  const save = useMutation({
    mutationFn: async (vars: Draft) => {
      const token = await getIdToken();
      await saveKaspiSettings(token, {
        strategy: vars.strategy,
        defaultUrl: vars.defaultUrl,
        groupLinks: vars.groups.map((g) => ({
          id: g.id,
          url: g.url,
          label: g.label,
          managerIds: g.managerIds,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KAS_KEY });
      toast.success("Настройки Kaspi сохранены");
    },
    onError: (err) => {
      const code = err instanceof KaspiApiError ? err.code : "unknown_error";
      const msg =
        code === "invalid_default_url"
          ? "Дефолтная ссылка невалидна"
          : code === "invalid_group_url"
            ? "Одна из групповых ссылок невалидна"
            : code === "group_label_required"
              ? "У каждой группы должно быть название"
              : code === "manager_in_multiple_groups"
                ? "Менеджер не может быть в нескольких группах"
                : code === "manager_not_active_staff"
                  ? "Один из выбранных сотрудников деактивирован"
                  : "Не удалось сохранить настройки";
      toast.error(msg);
    },
  });

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setDraft({
      strategy: settingsQ.data.strategy,
      defaultUrl: settingsQ.data.defaultLink?.url ?? "",
      groups: settingsQ.data.groupLinks.map((g) => ({
        id: g.id,
        url: g.url,
        label: g.label,
        managerIds: g.managers.map((m) => m.id),
      })),
    });
  }, [settingsQ.data]);

  if (settingsQ.isLoading) {
    return (
      <Card title="Kaspi">
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      </Card>
    );
  }
  if (settingsQ.isError || !settingsQ.data || !draft) {
    return (
      <Card title="Kaspi">
        <p className="text-red-error text-[14px]">
          Не удалось загрузить настройки.
        </p>
      </Card>
    );
  }

  // The guard above narrows `draft` here, but TS loses the narrowing
  // inside nested closures (onSave) since draft comes from useState. Bind
  // to a const so closures see Draft, not Draft | null.
  const currentDraft: Draft = draft;
  const data = settingsQ.data;
  const initial: Draft = {
    strategy: data.strategy,
    defaultUrl: data.defaultLink?.url ?? "",
    groups: data.groupLinks.map((g) => ({
      id: g.id,
      url: g.url,
      label: g.label,
      managerIds: g.managers.map((m) => m.id),
    })),
  };
  const isDirty = !sameDraft(currentDraft, initial);

  const validate = (d: Draft): string | null => {
    if (d.defaultUrl.trim() === "" || !isUrl(d.defaultUrl)) {
      return "Дефолтная ссылка обязательна";
    }
    if (d.strategy === "per_group") {
      const seen = new Set<string>();
      for (const g of d.groups) {
        if (g.label.trim() === "") return "У каждой группы должно быть название";
        if (g.url.trim() === "" || !isUrl(g.url))
          return "Одна из групповых ссылок невалидна";
        for (const m of g.managerIds) {
          if (seen.has(m)) {
            return "Менеджер не может быть в нескольких группах";
          }
          seen.add(m);
        }
      }
    }
    return null;
  };
  const validationError = validate(currentDraft);
  const canSave = isDirty && !save.isPending && !validationError;

  function onSave() {
    save.mutate(currentDraft);
  }
  function onCancel() {
    setDraft(initial);
  }

  // Map of manager id → group id so each group's add-picker can exclude
  // managers already taken by other groups.
  const managerGroupAssignment = new Map<string, number>();
  currentDraft.groups.forEach((g, i) => {
    g.managerIds.forEach((m) => managerGroupAssignment.set(m, i));
  });

  return (
    <Card title="Kaspi">
      <p className="max-w-[640px] text-[13px] leading-[1.5] text-grey-medium mb-5">
        Управляет ссылкой Kaspi, которую открывает мобильное приложение после
        создания заказа. «Одна общая ссылка» — все клиенты идут на дефолтную.
        «По группам» — клиенты с менеджером из группы идут на ссылку группы;
        остальные на дефолтную.
      </p>

      <div className="flex flex-col gap-4">
        {/* Strategy */}
        <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
          <h3 className="text-[14px] font-semibold text-[#0E131F] mb-3">
            Стратегия
          </h3>
          <div className="flex flex-col gap-2">
            <RadioRow
              label="Одна общая ссылка"
              checked={draft.strategy === "single"}
              onChange={() =>
                setDraft({ ...draft, strategy: "single" })
              }
            />
            <RadioRow
              label="По группам менеджеров"
              checked={draft.strategy === "per_group"}
              onChange={() =>
                setDraft({ ...draft, strategy: "per_group" })
              }
            />
          </div>
        </div>

        {/* Default link */}
        <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
          <h3 className="text-[14px] font-semibold text-[#0E131F] mb-1">
            Дефолтная ссылка
          </h3>
          <p className="text-[13px] leading-snug text-grey-medium mb-3">
            Открывается всегда (стратегия «одна») или для тех клиентов, чей
            менеджер не в группе.
          </p>
          <Input
            fullWidth
            label=""
            value={draft.defaultUrl}
            placeholder="https://kaspi.kz/..."
            onChange={(e) =>
              setDraft({ ...draft, defaultUrl: e.target.value })
            }
          />
        </div>

        {/* Groups */}
        {draft.strategy === "per_group" && (
          <div className="flex flex-col gap-3">
            {draft.groups.map((g, i) => (
              <GroupCard
                key={g.id ?? `new-${i}`}
                group={g}
                allStaff={data.activeStaff}
                managerGroupAssignment={managerGroupAssignment}
                groupIndex={i}
                onChange={(next) => {
                  const groups = [...draft.groups];
                  groups[i] = next;
                  setDraft({ ...draft, groups });
                }}
                onDelete={() => {
                  const groups = draft.groups.filter((_, j) => j !== i);
                  setDraft({ ...draft, groups });
                }}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  groups: [
                    ...draft.groups,
                    { id: null, url: "", label: "", managerIds: [] },
                  ],
                })
              }
              className="flex h-9 cursor-pointer items-center gap-2 self-start rounded-[8px] border border-dashed border-[rgba(102,112,133,0.4)] bg-white px-4 text-[14px] font-medium text-grey-dark hover:bg-grey-lighter"
            >
              <Plus size={16} strokeWidth={1.5} />
              Добавить группу
            </button>
          </div>
        )}

        {validationError && (
          <p className="text-[13px] text-red-error">{validationError}</p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={!canSave} className="!w-auto">
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {isDirty && (
            <button
              type="button"
              onClick={onCancel}
              disabled={save.isPending}
              className="cursor-pointer text-[14px] font-medium text-grey-dark px-4 py-[10px] rounded-[8px] hover:bg-grey-lighter"
            >
              Отмена
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function GroupCard({
  group,
  allStaff,
  managerGroupAssignment,
  groupIndex,
  onChange,
  onDelete,
}: {
  group: DraftGroup;
  allStaff: KaspiManagerSummary[];
  managerGroupAssignment: Map<string, number>;
  groupIndex: number;
  onChange: (next: DraftGroup) => void;
  onDelete: () => void;
}) {
  // Available staff for this group's add-picker = active staff minus those
  // assigned to any other group. The current group's picks are also
  // excluded so the dropdown only ever shows addable people.
  const pickerOptions = useMemo<SelectOption<string>[]>(() => {
    return allStaff
      .filter((s) => {
        const assigned = managerGroupAssignment.get(s.id);
        if (assigned === undefined) return true;
        return assigned === groupIndex
          ? !group.managerIds.includes(s.id)
          : false;
      })
      .map((s) => ({
        value: s.id,
        label: `${s.firstName} ${s.lastName}`.trim() || s.email,
        leading: (
          <Avatar
            src={s.avatarUrl}
            firstName={s.firstName}
            lastName={s.lastName}
            email={s.email}
            size={28}
          />
        ),
      }));
  }, [allStaff, managerGroupAssignment, group.managerIds, groupIndex]);

  // Resolve manager objects for the chip row.
  const selectedManagers = useMemo(() => {
    const map = new Map(allStaff.map((s) => [s.id, s]));
    return group.managerIds
      .map((id) => map.get(id))
      .filter((m): m is KaspiManagerSummary => m !== undefined);
  }, [allStaff, group.managerIds]);

  return (
    <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-[14px] font-semibold text-[#0E131F]">
          Группа{" "}
          <span className="text-grey-medium">
            {group.label.trim() || `№${groupIndex + 1}`}
          </span>
        </h3>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] text-grey-medium hover:bg-grey-lighter hover:text-red-error transition-colors"
          aria-label="Удалить группу"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          fullWidth
          label="Название"
          value={group.label}
          placeholder="Команда А"
          onChange={(e) => onChange({ ...group, label: e.target.value })}
        />
        <Input
          fullWidth
          label="Ссылка"
          value={group.url}
          placeholder="https://kaspi.kz/..."
          onChange={(e) => onChange({ ...group, url: e.target.value })}
        />
      </div>

      <div className="mt-4">
        <span className="text-[12px] font-medium text-grey-medium">
          Прикреплённые менеджеры
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {selectedManagers.length === 0 && (
            <span className="text-[13px] text-grey-medium">
              Никто не прикреплён
            </span>
          )}
          {selectedManagers.map((m) => (
            <ManagerChip
              key={m.id}
              manager={m}
              onRemove={() =>
                onChange({
                  ...group,
                  managerIds: group.managerIds.filter((id) => id !== m.id),
                })
              }
            />
          ))}
        </div>
        <div className="mt-3 w-full max-w-[360px]">
          <Select<string>
            value={null}
            onChange={(id) => {
              if (!id) return;
              onChange({
                ...group,
                managerIds: [...group.managerIds, id],
              });
            }}
            options={pickerOptions}
            searchable
            placeholder={
              pickerOptions.length === 0
                ? "Все доступные менеджеры уже выбраны"
                : "Добавить менеджера"
            }
            disabled={pickerOptions.length === 0}
          />
        </div>
      </div>
    </div>
  );
}

function ManagerChip({
  manager,
  onRemove,
}: {
  manager: KaspiManagerSummary;
  onRemove: () => void;
}) {
  const name =
    `${manager.firstName} ${manager.lastName}`.trim() || manager.email;
  return (
    <span className="inline-flex items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-grey-lighter pl-2 pr-1 py-1 text-[13px] text-[#0E131F]">
      <Avatar
        src={manager.avatarUrl}
        firstName={manager.firstName}
        lastName={manager.lastName}
        email={manager.email}
        size={20}
      />
      <span>{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-grey-medium hover:bg-white hover:text-red-error transition-colors"
        aria-label="Убрать"
      >
        <X size={13} strokeWidth={1.7} />
      </button>
    </span>
  );
}

function RadioRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        "flex items-center gap-3 rounded-[8px] border px-3 py-2.5 text-left text-[14px] font-medium transition-colors cursor-pointer",
        checked
          ? "border-purple-primary bg-purple-primary/5 text-[#0E131F]"
          : "border-[rgba(102,112,133,0.3)] text-grey-dark hover:bg-grey-lighter",
      )}
    >
      <span
        className={clsx(
          "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
          checked
            ? "border-purple-primary"
            : "border-[rgba(102,112,133,0.5)]",
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-purple-primary" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <h2 className="text-[16px] font-semibold text-[#0E131F] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function isUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  if (a.strategy !== b.strategy) return false;
  if (a.defaultUrl.trim() !== b.defaultUrl.trim()) return false;
  if (a.groups.length !== b.groups.length) return false;
  for (let i = 0; i < a.groups.length; i++) {
    const ga = a.groups[i];
    const gb = b.groups[i];
    if (ga.id !== gb.id) return false;
    if (ga.url.trim() !== gb.url.trim()) return false;
    if (ga.label.trim() !== gb.label.trim()) return false;
    if (ga.managerIds.length !== gb.managerIds.length) return false;
    const setA = new Set(ga.managerIds);
    for (const m of gb.managerIds) if (!setA.has(m)) return false;
  }
  return true;
}
