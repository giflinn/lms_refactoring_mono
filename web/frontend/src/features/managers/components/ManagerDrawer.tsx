import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy } from "lucide-react";
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
  useUploadManagerAvatar,
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
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.role === "admin";
  const isEdit = manager !== null;
  const isSelf = isEdit && user?.id === manager.id;

  const create = useCreateManager();
  const update = useUpdateManager();
  const reset = useResetManagerPassword();
  const uploadAvatar = useUploadManagerAvatar();

  const [generalError, setGeneralError] = useState<string | undefined>();
  const [resetState, setResetState] = useState<
    | { mode: "idle" }
    | { mode: "confirm" }
    | { mode: "done" }
  >({ mode: "idle" });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function copyCode() {
    if (!manager?.managerCode) return;
    try {
      await navigator.clipboard.writeText(manager.managerCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // Clipboard API can fail on insecure contexts; nothing to recover.
    }
  }

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
    setPendingFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  // Free the object-URL preview when it changes or unmounts.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setPendingFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setGeneralError(undefined);
  }

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
      let savedId: string;
      if (isEdit && manager) {
        const patch: Partial<ManagerInput> = { ...payload };
        // Drop isSenior unless it's a real toggle change on a non-admin target
        // by an admin actor — otherwise the backend role-gate rejects it.
        const wasSenior = manager.role === "senior_manager";
        const canToggleRole =
          isAdmin && manager.role !== "admin" && payload.isSenior !== wasSenior;
        if (!canToggleRole) delete patch.isSenior;
        await update.mutateAsync({ id: manager.id, patch });
        savedId = manager.id;
      } else {
        const created = await create.mutateAsync(payload);
        savedId = created.id;
      }
      if (pendingFile) {
        await uploadAvatar.mutateAsync({ id: savedId, file: pendingFile });
      }
      if (isSelf) {
        await refreshUser();
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
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-[150px] w-[150px] rounded-full object-cover"
            />
          ) : (
            <Avatar
              src={manager?.avatarUrl}
              firstName={watch("firstName")}
              lastName={watch("lastName")}
              email={watch("email")}
              size={150}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickFile}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-5 py-2 text-[14px] font-medium text-grey-medium hover:bg-grey-lighter transition-colors"
            >
              {previewUrl || manager?.avatarUrl
                ? "Изменить фото"
                : "Добавить фото"}
            </button>
            {isEdit && manager && !isSelf && (
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

        {isEdit && manager?.managerCode && (
          <div className="flex w-full flex-col gap-1">
            <label className="py-1 text-[14px] font-medium text-grey-dark">
              Код менеджера
            </label>
            <div className="flex h-[44px] items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-grey-lighter px-3 py-2.5">
              <span className="flex-1 min-w-0 text-[14px] font-medium tracking-[2px] text-grey-dark">
                {manager.managerCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="cursor-pointer text-grey-medium hover:text-grey-dark transition-colors"
                aria-label={codeCopied ? "Скопировано" : "Скопировать код"}
              >
                {codeCopied ? (
                  <Check size={18} strokeWidth={2} className="text-purple-primary" />
                ) : (
                  <Copy size={18} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
        )}

        <Textarea
          label="Комментарий"
          rows={5}
          {...register("comment")}
          error={errors.comment?.message}
        />

        {isAdmin && manager?.role !== "admin" && (
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
          <h3 className="text-[16px] font-semibold text-[#0E131F]">
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
              className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={reset.isPending}
              onClick={confirmReset}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
          <h3 className="text-[16px] font-semibold text-[#0E131F]">
            Пароль сброшен
          </h3>
          <p className="text-[14px] leading-relaxed text-grey-medium">
            Новый пароль отправлен на {manager?.email}.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setResetState({ mode: "idle" })}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white"
            >
              Готово
            </button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
}
