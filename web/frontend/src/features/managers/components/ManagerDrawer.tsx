import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "../../../components/ui/Drawer";
import { Modal } from "../../../components/ui/Modal";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Toggle } from "../../../components/ui/Toggle";
import { Button } from "../../../components/ui/Button";
import { Avatar } from "../../../components/Avatar";
import { useAuth } from "../../../auth/AuthContext";
import {
  managerFormSchema,
  type ManagerFormValues,
} from "../schema";
import { ApiError, type Manager, type ManagerInput } from "../api";
import {
  useCreateManager,
  useResetManagerPassword,
  useUpdateManager,
} from "../queries";
import { mapError } from "../errors";

type Props = {
  open: boolean;
  manager: Manager | null;
  onClose: () => void;
};

const EMPTY: ManagerFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  comment: "",
  isSenior: false,
};

export function ManagerDrawer({ open, manager, onClose }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isEdit = manager !== null;

  const create = useCreateManager();
  const update = useUpdateManager();
  const reset = useResetManagerPassword();

  const [generalError, setGeneralError] = useState<string | undefined>();
  const [resetState, setResetState] = useState<
    | { mode: "idle" }
    | { mode: "confirm" }
    | { mode: "done" }
  >({ mode: "idle" });

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<ManagerFormValues>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: EMPTY,
  });

  // Reset form whenever the drawer opens for a different manager / for create.
  useEffect(() => {
    if (!open) return;
    setGeneralError(undefined);
    setResetState({ mode: "idle" });
    if (manager) {
      resetForm({
        firstName: manager.firstName,
        lastName: manager.lastName,
        email: manager.email,
        phone: manager.phone ?? "",
        comment: manager.comment ?? "",
        isSenior: manager.role === "senior_manager",
      });
    } else {
      resetForm(EMPTY);
    }
  }, [open, manager, resetForm]);

  const isSenior = watch("isSenior");

  function applyApiError(err: unknown) {
    if (err instanceof ApiError) {
      const mapped = mapError(err.code);
      const fields = mapped.fields;
      let fieldHandled = false;
      (Object.keys(fields) as (keyof typeof fields)[]).forEach((k) => {
        const msg = fields[k];
        if (msg) {
          setError(k as keyof ManagerFormValues, { message: msg });
          fieldHandled = true;
        }
      });
      if (!fieldHandled) setGeneralError(mapped.general);
    } else {
      setGeneralError("Нет соединения с сервером.");
    }
  }

  async function onSubmit(values: ManagerFormValues) {
    setGeneralError(undefined);
    const payload: ManagerInput = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      comment: values.comment?.trim() ? values.comment.trim() : null,
      isSenior: values.isSenior,
    };
    try {
      if (isEdit && manager) {
        const patch: Partial<ManagerInput> = { ...payload };
        if (!isAdmin) delete patch.isSenior;
        await update.mutateAsync({ id: manager.id, patch });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      applyApiError(err);
    }
  }

  async function confirmReset() {
    if (!manager) return;
    setGeneralError(undefined);
    try {
      await reset.mutateAsync(manager.id);
      setResetState({ mode: "done" });
    } catch (err) {
      setResetState({ mode: "idle" });
      applyApiError(err);
    }
  }

  return (
    <Drawer
      open={open}
      title={isEdit ? "Редактировать" : "Добавить менеджера"}
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="manager-form"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? isEdit
              ? "Сохраняем…"
              : "Добавляем…"
            : isEdit
              ? "Сохранить изменения"
              : "Добавить"}
        </Button>
      }
    >
      <form
        id="manager-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 pb-2"
      >
        <div className="flex flex-col items-center gap-2">
          <Avatar
            src={manager?.avatarUrl}
            firstName={watch("firstName")}
            lastName={watch("lastName")}
            email={watch("email")}
            size={150}
          />
          {isEdit && manager && (
            <button
              type="button"
              onClick={() => setResetState({ mode: "confirm" })}
              disabled={reset.isPending}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-5 py-2 text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              Сбросить пароль
            </button>
          )}
        </div>

        <Input
          fullWidth
          label="Имя*"
          {...register("firstName")}
          error={errors.firstName?.message}
        />
        <Input
          fullWidth
          label="Фамилия*"
          {...register("lastName")}
          error={errors.lastName?.message}
        />
        <Input
          fullWidth
          label="Адрес электронной почты*"
          type="email"
          {...register("email")}
          error={errors.email?.message}
        />
        <Input
          fullWidth
          label="Номер телефона*"
          placeholder="+7…"
          {...register("phone")}
          error={errors.phone?.message}
        />
        <Textarea
          label="Комментарий"
          rows={5}
          {...register("comment")}
          error={errors.comment?.message}
        />

        {isAdmin && (
          <div className="flex items-center gap-4 py-2">
            <span className="text-[14px] font-medium text-grey-dark">
              Главный менеджер
            </span>
            <Toggle
              checked={isSenior}
              onChange={(v) => setValue("isSenior", v, { shouldDirty: true })}
            />
          </div>
        )}

        {generalError && (
          <p className="text-[13px] text-red-error">{generalError}</p>
        )}
      </form>

      <Modal
        open={resetState.mode === "confirm"}
        onClose={reset.isPending ? () => {} : () => setResetState({ mode: "idle" })}
      >
        <div className="flex w-[420px] flex-col gap-4 p-6">
          <h3 className="text-[18px] font-semibold text-[#0E131F]">
            Сбросить пароль?
          </h3>
          <p className="text-[14px] leading-relaxed text-grey-medium">
            Будет сгенерирован новый пароль и отправлен на {manager?.email}.
            Менеджер будет автоматически разлогинен на всех устройствах.
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => setResetState({ mode: "idle" })}
              className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-6 py-3 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={reset.isPending}
              onClick={confirmReset}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-6 py-3 text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reset.isPending ? "Отправка…" : "Сбросить"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetState.mode === "done"}
        onClose={() => setResetState({ mode: "idle" })}
      >
        <div className="flex w-[420px] flex-col gap-4 p-6">
          <h3 className="text-[18px] font-semibold text-[#0E131F]">
            Пароль сброшен
          </h3>
          <p className="text-[14px] leading-relaxed text-grey-medium">
            Новый пароль отправлен на {manager?.email}.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setResetState({ mode: "idle" })}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-6 py-3 text-[14px] font-medium text-white"
            >
              Готово
            </button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
}
