import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Button } from "../../../components/ui/Button";
import { Avatar } from "../../../components/Avatar";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { useAuth } from "../../../auth/AuthContext";
import { ApiError, type Client, type ClientPatch } from "../api";
import { useUpdateClient, useStaffList } from "../queries";
import { mapError } from "../errors";
import { clientFormSchema, type ClientFormValues } from "../schema";
import { CATEGORY_OPTIONS } from "./CategoryBadge";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import { OrderDrawer } from "../../orders/components/OrderDrawer";

type Props = {
  open: boolean;
  client: Client | null;
  onClose: () => void;
};

const EMPTY: ClientFormValues = {
  phone: "",
  birthDate: "",
  comment: "",
  managerId: "",
  clientCategory: "new",
};

type Tab = "details" | "history";

export function ClientDrawer({ open, client, onClose }: Props) {
  const { user } = useAuth();
  const isPlainManager = user?.role === "manager";
  const canReassignManager = !isPlainManager;

  const update = useUpdateClient();
  const staffList = useStaffList(open && canReassignManager);

  const [tab, setTab] = useState<Tab>("details");
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [orderDrawerId, setOrderDrawerId] = useState<string | null>(null);
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setTab("details");
    setGeneralError(undefined);
    setOrderDrawerOpen(false);
    setOrderDrawerId(null);
    if (client) {
      resetForm({
        phone: client.phone ?? "",
        birthDate: client.birthDate ?? "",
        comment: client.comment ?? "",
        managerId: client.managerId ?? "",
        clientCategory: client.clientCategory,
      });
    } else {
      resetForm(EMPTY);
    }
  }, [open, client, resetForm]);

  const managerOptions = useMemo<SelectOption<string>[]>(() => {
    const list = staffList.data ?? [];
    // The current manager may be outside the list (e.g. an admin actor when
    // the staff query is scoped). Append it so the selected value always
    // resolves to a real option.
    const merged = client?.manager &&
      !list.some((m) => m.id === client.manager?.id)
      ? [
          {
            id: client.manager.id,
            firstName: client.manager.firstName,
            lastName: client.manager.lastName,
            email: client.manager.email,
            avatarUrl: client.manager.avatarUrl,
          },
          ...list,
        ]
      : list;
    return merged.map((m) => ({
      value: m.id,
      label: `${m.firstName} ${m.lastName}`.trim() || m.email,
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
  }, [staffList.data, client]);

  function applyApiError(err: unknown) {
    if (err instanceof ApiError) {
      const mapped = mapError(err.code);
      const fields = mapped.fields;
      let fieldHandled = false;
      (Object.keys(fields) as (keyof typeof fields)[]).forEach((k) => {
        const msg = fields[k];
        if (msg) {
          setError(k as keyof ClientFormValues, { message: msg });
          fieldHandled = true;
        }
      });
      if (!fieldHandled) setGeneralError(mapped.general);
    } else {
      setGeneralError("Нет соединения с сервером.");
    }
  }

  async function onSubmit(values: ClientFormValues) {
    if (!client) return;
    setGeneralError(undefined);
    const patch: ClientPatch = {
      phone: values.phone.trim(),
      comment: values.comment.trim() ? values.comment.trim() : null,
      birthDate: values.birthDate.trim() ? values.birthDate.trim() : null,
      clientCategory: values.clientCategory,
    };
    if (canReassignManager && values.managerId !== (client.managerId ?? "")) {
      patch.managerId = values.managerId;
    }
    try {
      await update.mutateAsync({ id: client.id, patch });
      onClose();
    } catch (err) {
      applyApiError(err);
    }
  }

  const watchedManagerId = watch("managerId");
  const watchedCategory = watch("clientCategory");

  return (
    <>
    <Drawer
      open={open}
      title="Клиент"
      onClose={onClose}
      footer={
        tab === "details" && client ? (
          <Button type="submit" form="client-form" disabled={isSubmitting}>
            {isSubmitting ? "Сохраняем…" : "Сохранить изменения"}
          </Button>
        ) : null
      }
    >
      {client && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              src={client.avatarUrl}
              firstName={client.firstName}
              lastName={client.lastName}
              email={client.email}
              size={96}
            />
            <p className="mt-2 text-[16px] font-semibold text-[#0E131F]">
              {client.firstName} {client.lastName}
            </p>
            <p className="text-[13px] font-medium text-[#96999D]">
              {client.email}
            </p>
          </div>

          <div className="flex w-full overflow-hidden rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-grey-lighter p-1">
            <TabButton
              label="Личные данные"
              active={tab === "details"}
              onClick={() => setTab("details")}
            />
            <TabButton
              label="История покупок"
              active={tab === "history"}
              onClick={() => setTab("history")}
            />
          </div>

          {tab === "details" ? (
            <form
              id="client-form"
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Input
                fullWidth
                label="Дата рождения"
                type="date"
                {...register("birthDate")}
                error={errors.birthDate?.message}
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
              <Select<string>
                label="Менеджер"
                value={watchedManagerId || null}
                onChange={(v) =>
                  setValue("managerId", v ?? "", { shouldDirty: true })
                }
                options={managerOptions}
                searchable
                disabled={!canReassignManager}
                placeholder="Выберите менеджера"
              />
              {errors.managerId && (
                <span className="-mt-3 text-[12px] text-red-500 leading-tight">
                  {errors.managerId.message}
                </span>
              )}
              <Select
                label="Категория клиента"
                value={watchedCategory}
                onChange={(v) =>
                  v &&
                  setValue("clientCategory", v, { shouldDirty: true })
                }
                options={CATEGORY_OPTIONS}
                placeholder="Выберите категорию"
              />

              {generalError && (
                <p className="text-[13px] text-red-error">{generalError}</p>
              )}
            </form>
          ) : (
            <PurchaseHistoryTab
              clientId={client.id}
              onOpenOrder={(id) => {
                setOrderDrawerId(id);
                setOrderDrawerOpen(true);
              }}
            />
          )}
        </div>
      )}
    </Drawer>
    <OrderDrawer
      orderId={orderDrawerId}
      open={orderDrawerOpen}
      onClose={() => setOrderDrawerOpen(false)}
    />
    </>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex-1 cursor-pointer rounded-[6px] px-3 py-2 text-[14px] font-medium transition-colors",
        active
          ? "bg-white text-[#0E131F] shadow-[0_1px_3px_rgba(16,24,40,0.1)]"
          : "text-grey-medium hover:text-grey-dark",
      )}
    >
      {label}
    </button>
  );
}
