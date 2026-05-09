import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { auth } from "../../../firebase";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/ui/Button";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { listManagers } from "../../managers/api";
import {
  AssignmentApiError,
  getManagerAssignment,
  saveManagerAssignment,
  type AssignmentScopeConfig,
  type AssignmentStrategy,
  type ManagerAssignmentSettings,
} from "../api/managerAssignment";

const STRATEGY_LABELS: Record<AssignmentStrategy, string> = {
  any_admin: "Любому администратору",
  any_senior_manager: "Любому старшему менеджеру",
  any_manager: "Любому менеджеру",
  specific: "Конкретному сотруднику",
};

const STRATEGY_ORDER: AssignmentStrategy[] = [
  "any_admin",
  "any_senior_manager",
  "any_manager",
  "specific",
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  senior_manager: "Старший менеджер",
  manager: "Менеджер",
};

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

const SETTINGS_KEY = ["settings", "manager-assignment"] as const;

export function ManagerAssignmentSection() {
  const qc = useQueryClient();

  const settingsQ = useQuery<ManagerAssignmentSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const token = await getIdToken();
      return getManagerAssignment(token);
    },
  });

  const staffQ = useQuery({
    queryKey: ["settings", "manager-assignment-staff"] as const,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listManagers(token, { pageSize: 50, status: "active" });
      return res.managers;
    },
  });

  const save = useMutation({
    mutationFn: async (vars: {
      onRegister: { strategy: AssignmentStrategy; targetUserId: string | null };
      onDelete: { strategy: AssignmentStrategy; targetUserId: string | null };
    }) => {
      const token = await getIdToken();
      await saveManagerAssignment(token, vars);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast.success("Настройки назначения сохранены");
    },
    onError: (err) => {
      const code =
        err instanceof AssignmentApiError ? err.code : "unknown_error";
      const msg =
        code === "specific_target_required"
          ? "Выберите сотрудника для стратегии «Конкретный сотрудник»"
          : code === "target_not_active_staff"
            ? "Выбранный сотрудник деактивирован — выберите другого"
            : "Не удалось сохранить настройки";
      toast.error(msg);
    },
  });

  // Local draft. Hydrated from server, mutated by the form, sent on save.
  const [registerDraft, setRegisterDraft] = useState<DraftScope | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<DraftScope | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setRegisterDraft(toDraft(settingsQ.data.onRegister));
    setDeleteDraft(toDraft(settingsQ.data.onDelete));
  }, [settingsQ.data]);

  const staffOptions = useMemo<SelectOption<string>[]>(() => {
    return (staffQ.data ?? []).map((m) => ({
      value: m.id,
      label:
        `${m.firstName} ${m.lastName}`.trim() || m.email,
      leading: (
        <Avatar
          src={m.avatarUrl}
          firstName={m.firstName}
          lastName={m.lastName}
          email={m.email}
          size={28}
        />
      ),
    }));
  }, [staffQ.data]);

  if (settingsQ.isLoading) {
    return (
      <Card title="Назначение менеджеров">
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      </Card>
    );
  }
  if (settingsQ.isError || !registerDraft || !deleteDraft) {
    return (
      <Card title="Назначение менеджеров">
        <p className="text-red-error text-[14px]">
          Не удалось загрузить настройки.
        </p>
      </Card>
    );
  }

  const initialRegister = toDraft(settingsQ.data!.onRegister);
  const initialDelete = toDraft(settingsQ.data!.onDelete);
  const isDirty =
    !sameDraft(registerDraft, initialRegister) ||
    !sameDraft(deleteDraft, initialDelete);

  const validateDraft = (d: DraftScope): boolean => {
    if (d.strategy === "specific" && !d.targetUserId) return false;
    return true;
  };
  const canSave =
    isDirty &&
    !save.isPending &&
    validateDraft(registerDraft) &&
    validateDraft(deleteDraft);

  function onSave() {
    if (!registerDraft || !deleteDraft) return;
    save.mutate({
      onRegister: {
        strategy: registerDraft.strategy,
        targetUserId:
          registerDraft.strategy === "specific"
            ? registerDraft.targetUserId
            : null,
      },
      onDelete: {
        strategy: deleteDraft.strategy,
        targetUserId:
          deleteDraft.strategy === "specific"
            ? deleteDraft.targetUserId
            : null,
      },
    });
  }

  function onCancel() {
    setRegisterDraft(initialRegister);
    setDeleteDraft(initialDelete);
  }

  return (
    <Card title="Назначение менеджеров">
      <p className="max-w-[640px] text-[13px] leading-[1.5] text-grey-medium mb-5">
        Управляет тем, кто становится «менеджером по умолчанию» для клиента.
        Если ни одного активного сотрудника выбранной роли нет — сработает
        запасной вариант: старейший активный администратор.
      </p>

      <div className="flex flex-col gap-4">
        <ScopeBlock
          title="При регистрации (если не указан код)"
          description="Применяется, когда клиент регистрируется в мобильном приложении без кода менеджера."
          draft={registerDraft}
          onChange={setRegisterDraft}
          staffOptions={staffOptions}
          currentTarget={settingsQ.data?.onRegister.target ?? null}
        />
        <ScopeBlock
          title="После удаления менеджера"
          description="Применяется при деактивации сотрудника — клиенты этого менеджера распределяются по выбранной стратегии."
          draft={deleteDraft}
          onChange={setDeleteDraft}
          staffOptions={staffOptions}
          currentTarget={settingsQ.data?.onDelete.target ?? null}
        />
      </div>

      <div className="flex items-center gap-2 mt-5">
        <Button
          onClick={onSave}
          disabled={!canSave}
          className="!w-auto"
        >
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
    </Card>
  );
}

type DraftScope = {
  strategy: AssignmentStrategy;
  targetUserId: string | null;
};

function toDraft(cfg: AssignmentScopeConfig): DraftScope {
  return { strategy: cfg.strategy, targetUserId: cfg.targetUserId };
}

function sameDraft(a: DraftScope, b: DraftScope): boolean {
  return a.strategy === b.strategy && a.targetUserId === b.targetUserId;
}

function ScopeBlock({
  title,
  description,
  draft,
  onChange,
  staffOptions,
  currentTarget,
}: {
  title: string;
  description: string;
  draft: DraftScope;
  onChange: (next: DraftScope) => void;
  staffOptions: SelectOption<string>[];
  currentTarget: AssignmentScopeConfig["target"];
}) {
  const targetDeactivated =
    draft.strategy === "specific" &&
    draft.targetUserId !== null &&
    currentTarget?.id === draft.targetUserId &&
    currentTarget.deactivated;

  // If the saved target is deactivated, keep it visible in the dropdown so
  // the admin can see what's going on (and pick a replacement).
  const optionsWithSavedTarget = useMemo<SelectOption<string>[]>(() => {
    if (
      currentTarget &&
      !staffOptions.some((o) => o.value === currentTarget.id)
    ) {
      return [
        {
          value: currentTarget.id,
          label:
            `${currentTarget.firstName} ${currentTarget.lastName}`.trim() ||
            currentTarget.email,
          leading: (
            <Avatar
              src={currentTarget.avatarUrl}
              firstName={currentTarget.firstName}
              lastName={currentTarget.lastName}
              email={currentTarget.email}
              size={28}
            />
          ),
        },
        ...staffOptions,
      ];
    }
    return staffOptions;
  }, [staffOptions, currentTarget]);

  return (
    <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
      <h3 className="text-[14px] font-semibold text-[#0E131F]">{title}</h3>
      <p className="text-[13px] leading-snug text-grey-medium mt-1">
        {description}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {STRATEGY_ORDER.map((s) => (
          <RadioRow
            key={s}
            label={STRATEGY_LABELS[s]}
            checked={draft.strategy === s}
            onChange={() =>
              onChange({
                strategy: s,
                targetUserId: s === "specific" ? draft.targetUserId : null,
              })
            }
          />
        ))}
      </div>

      {draft.strategy === "specific" && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-grey-medium">
            Сотрудник
          </span>
          <div className="w-full max-w-[420px]">
            <Select<string>
              value={draft.targetUserId}
              onChange={(v) =>
                onChange({ ...draft, targetUserId: v })
              }
              options={optionsWithSavedTarget}
              searchable
              placeholder="Выберите сотрудника"
            />
          </div>
          {currentTarget && draft.targetUserId === currentTarget.id && (
            <span className="text-[12px] text-grey-medium">
              Сейчас: {ROLE_LABELS[currentTarget.role] ?? currentTarget.role}
              {targetDeactivated && (
                <span className="text-red-error">
                  {" "}
                  · сотрудник деактивирован, сработает запасной admin
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
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
        {checked && (
          <span className="h-2 w-2 rounded-full bg-purple-primary" />
        )}
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
