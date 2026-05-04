import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Toggle } from "../../../components/ui/Toggle";
import { Button } from "../../../components/ui/Button";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { ProductPreviewCard } from "./ProductPreviewCard";
import {
  productFormSchema,
  type ProductFormValues,
} from "../schema";
import {
  ApiError,
  type Product,
  type ProductCategory,
  type ProductCoverKind,
  type ProductInput,
} from "../api";
import { useCreateProduct, useUpdateProduct } from "../queries";
import { useSlotTypes } from "../../coachCalendar/queries";
import { mapError } from "../errors";

type Props = {
  open: boolean;
  product: Product | null;
  categories: ProductCategory[];
  onClose: () => void;
  // Optional preselect when opening from a category context.
  presetCategoryId?: string | null;
};

const EMPTY: ProductFormValues = {
  categoryId: "",
  title: "",
  subtitle: "",
  description: "",
  buttonText: "",
  priceOnRequest: false,
  priceTenge: "",
  daysUntilCancel: "",
  activeDurationDays: "",
  isPromo: false,
  isActive: true,
  isTopSearch: false,
  bookingEnabled: false,
  durationMinutes: "",
  slotTypeIds: [],
};

const apiBase = import.meta.env.VITE_API_URL as string;

function resolveCoverSrc(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${apiBase}${path}` : path;
}

// Convert a stored numeric string ("1500.00") back to whole-tenge form for
// the input. We strip trailing ".00" since the admin form only takes integers.
function priceToInput(price: string | null): string {
  if (price == null || price === "") return "";
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return String(Math.round(n));
}

export function ProductFormDrawer({
  open,
  product,
  categories,
  onClose,
  presetCategoryId,
}: Props) {
  const isEdit = product !== null;

  const create = useCreateProduct();
  const update = useUpdateProduct();
  const slotTypesQ = useSlotTypes();
  const activeSlotTypes = useMemo(
    () => (slotTypesQ.data ?? []).filter((t) => t.archivedAt === null),
    [slotTypesQ.data],
  );

  const [generalError, setGeneralError] = useState<string | undefined>();
  const [coverKind, setCoverKind] = useState<ProductCoverKind>("preset");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | undefined>();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const fullInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: EMPTY,
  });

  // Repopulate the form when the modal opens for create / edit / different
  // product. Object-URLs from previous runs are revoked in the cleanup below.
  useEffect(() => {
    if (!open) return;
    setGeneralError(undefined);
    setCoverError(undefined);
    setPendingFile(null);
    setPreviewUrl(null);
    if (bgInputRef.current) bgInputRef.current.value = "";
    if (fullInputRef.current) fullInputRef.current.value = "";

    if (product) {
      setCoverKind(product.coverKind);
      reset({
        categoryId: product.categoryId,
        title: product.title,
        subtitle: product.subtitle ?? "",
        description: product.description,
        buttonText: product.buttonText,
        priceOnRequest: product.price == null,
        priceTenge: priceToInput(product.price),
        daysUntilCancel: String(product.daysUntilCancel),
        activeDurationDays:
          product.activeDurationDays != null
            ? String(product.activeDurationDays)
            : "",
        isPromo: product.isPromo,
        isActive: product.isActive,
        isTopSearch: product.isTopSearch,
        bookingEnabled: product.durationMinutes != null,
        durationMinutes:
          product.durationMinutes != null ? String(product.durationMinutes) : "",
        slotTypeIds: product.slotTypeIds,
      });
    } else {
      setCoverKind("preset");
      reset({
        ...EMPTY,
        categoryId: presetCategoryId ?? "",
      });
    }
  }, [open, product, presetCategoryId, reset]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const watched = watch();
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === watched.categoryId) ?? null,
    [categories, watched.categoryId],
  );

  // Cover image source for the live preview: locally-picked file > existing
  // server-side URL (when editing) > null (preset shows the placeholder PNG).
  const coverSrcForPreview = previewUrl
    ? previewUrl
    : resolveCoverSrc(product?.coverImageUrl ?? null);

  function onPickFile(
    e: React.ChangeEvent<HTMLInputElement>,
    targetKind: "custom_bg" | "custom_full",
  ) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setPendingFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setCoverKind(targetKind);
    setCoverError(undefined);
  }

  function clearCover() {
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCoverKind("preset");
    setCoverError(undefined);
    if (bgInputRef.current) bgInputRef.current.value = "";
    if (fullInputRef.current) fullInputRef.current.value = "";
  }

  function applyApiError(err: unknown) {
    if (err instanceof ApiError) {
      const mapped = mapError(err.code);
      const fields = mapped.fields;
      let handled = false;
      if (fields.categoryId) {
        setError("categoryId", { message: fields.categoryId });
        handled = true;
      }
      if (fields.title) {
        setError("title", { message: fields.title });
        handled = true;
      }
      if (fields.subtitle) {
        setError("subtitle", { message: fields.subtitle });
        handled = true;
      }
      if (fields.description) {
        setError("description", { message: fields.description });
        handled = true;
      }
      if (fields.buttonText) {
        setError("buttonText", { message: fields.buttonText });
        handled = true;
      }
      if (fields.price) {
        setError("priceTenge", { message: fields.price });
        handled = true;
      }
      if (fields.daysUntilCancel) {
        setError("daysUntilCancel", { message: fields.daysUntilCancel });
        handled = true;
      }
      if (fields.activeDurationDays) {
        setError("activeDurationDays", {
          message: fields.activeDurationDays,
        });
        handled = true;
      }
      if (fields.durationMinutes) {
        setError("durationMinutes", { message: fields.durationMinutes });
        handled = true;
      }
      if (fields.slotTypeIds) {
        setError("slotTypeIds", { message: fields.slotTypeIds });
        handled = true;
      }
      if (fields.coverFile) {
        setCoverError(fields.coverFile);
        handled = true;
      }
      if (!handled) setGeneralError(mapped.general);
    } else {
      setGeneralError("Нет соединения с сервером.");
    }
  }

  async function onSubmit(values: ProductFormValues) {
    setGeneralError(undefined);
    setCoverError(undefined);

    // For custom kinds we need an image: either freshly picked, or already on
    // the server (edit). If both are missing, surface the error before we
    // even hit the network.
    const isCustom = coverKind !== "preset";
    if (isCustom && !pendingFile && !product?.coverImageUrl) {
      setCoverError("Загрузите изображение.");
      return;
    }

    const input: ProductInput = {
      categoryId: values.categoryId,
      title: values.title.trim(),
      subtitle: values.subtitle.trim() || null,
      description: values.description.trim(),
      buttonText: values.buttonText.trim(),
      price: values.priceOnRequest ? null : values.priceTenge.trim(),
      daysUntilCancel: Number(values.daysUntilCancel),
      activeDurationDays:
        values.activeDurationDays.trim() === ""
          ? null
          : Number(values.activeDurationDays),
      durationMinutes: values.bookingEnabled
        ? Number(values.durationMinutes)
        : null,
      slotTypeIds: values.bookingEnabled ? values.slotTypeIds : [],
      isPromo: values.isPromo,
      isActive: values.isActive,
      isTopSearch: values.isTopSearch,
      coverKind,
      coverFile: pendingFile,
    };

    try {
      if (isEdit && product) {
        await update.mutateAsync({ id: product.id, input });
      } else {
        await create.mutateAsync(input);
      }
      onClose();
    } catch (err) {
      applyApiError(err);
    }
  }

  const categoryOptions = useMemo<SelectOption<string>[]>(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const showResetCover = coverKind !== "preset" || !!previewUrl;

  return (
    <Drawer
      open={open}
      title={isEdit ? "Редактировать продукт" : "Добавить продукт"}
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="product-form"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? isEdit
              ? "Сохраняем…"
              : "Добавляем…"
            : isEdit
              ? "Сохранить"
              : "Добавить"}
        </Button>
      }
    >
      <form
        id="product-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 pb-2"
      >
          <Select<string>
            label="Категория*"
            value={watched.categoryId || null}
            onChange={(v) =>
              setValue("categoryId", v ?? "", { shouldValidate: true })
            }
            options={categoryOptions}
            placeholder="Выберите категорию"
            searchable={categoryOptions.length > 8}
          />
          {errors.categoryId && (
            <p className="-mt-2 text-[12px] text-red-error">
              {errors.categoryId.message}
            </p>
          )}

          <div className="flex items-center gap-6 pt-1">
            <ToggleField
              label="Акция"
              checked={watched.isPromo}
              onChange={(v) => setValue("isPromo", v)}
            />
            <ToggleField
              label="Активный"
              checked={watched.isActive}
              onChange={(v) => setValue("isActive", v)}
            />
            <ToggleField
              label="Топ поиска"
              checked={watched.isTopSearch}
              onChange={(v) => setValue("isTopSearch", v)}
            />
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <ProductPreviewCard
              title={watched.title}
              subtitle={watched.subtitle}
              buttonText={watched.buttonText}
              categoryName={selectedCategory?.name ?? null}
              coverKind={coverKind}
              coverImageSrc={coverSrcForPreview}
              size={300}
            />
            <input
              ref={bgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPickFile(e, "custom_bg")}
            />
            <input
              ref={fullInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPickFile(e, "custom_full")}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <SecondaryButton
                onClick={() => bgInputRef.current?.click()}
                active={coverKind === "custom_bg"}
              >
                {coverKind === "custom_bg"
                  ? "Изменить фон"
                  : "+ Добавить фон"}
              </SecondaryButton>
              <SecondaryButton
                onClick={() => fullInputRef.current?.click()}
                active={coverKind === "custom_full"}
              >
                {coverKind === "custom_full"
                  ? "Изменить обложку"
                  : "+ Своя обложка"}
              </SecondaryButton>
              {showResetCover && (
                <button
                  type="button"
                  onClick={clearCover}
                  className="cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-grey-medium hover:text-grey-dark"
                >
                  Сбросить
                </button>
              )}
            </div>
            {coverError && (
              <p className="text-[12px] text-red-error">{coverError}</p>
            )}
          </div>

          <Input
            fullWidth
            label="Название*"
            {...register("title")}
            error={errors.title?.message}
          />
          <Input
            fullWidth
            label="Подпись"
            placeholder="23-24 Марта"
            {...register("subtitle")}
            error={errors.subtitle?.message}
          />
          <Input
            fullWidth
            label="Текст кнопки*"
            placeholder="Подробнее"
            {...register("buttonText")}
            error={errors.buttonText?.message}
          />
          <Textarea
            label="Описание*"
            rows={5}
            {...register("description")}
            error={errors.description?.message}
          />

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <Input
                fullWidth
                label="Цена, ₸*"
                inputMode="numeric"
                placeholder={watched.priceOnRequest ? "По запросу" : "0"}
                disabled={watched.priceOnRequest}
                {...register("priceTenge")}
                error={errors.priceTenge?.message}
              />
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-[13px] text-grey-dark">
                <Toggle
                  checked={watched.priceOnRequest}
                  onChange={(v) => setValue("priceOnRequest", v)}
                />
                По запросу
              </label>
            </div>
            <Input
              fullWidth
              label="Дней до отмены*"
              inputMode="numeric"
              placeholder="0"
              {...register("daysUntilCancel")}
              error={errors.daysUntilCancel?.message}
            />
          </div>

          <section className="flex flex-col gap-3 rounded-[8px] border border-[#EAECF0] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-grey-dark">
                Бронирование времени коача
              </span>
              <Toggle
                checked={watched.bookingEnabled}
                onChange={(v) => {
                  setValue("bookingEnabled", v, { shouldValidate: true });
                  // Clear paired errors when the toggle flips off so the form
                  // doesn't show stale messages for hidden fields.
                  if (!v) {
                    setValue("durationMinutes", "");
                    setValue("slotTypeIds", []);
                  }
                }}
              />
            </label>
            {watched.bookingEnabled && (
              <>
                <Input
                  fullWidth
                  label="Длительность, мин*"
                  inputMode="numeric"
                  placeholder="60"
                  {...register("durationMinutes")}
                  error={errors.durationMinutes?.message}
                />
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-grey-medium">
                    Типы слотов*
                  </span>
                  {activeSlotTypes.length === 0 ? (
                    <p className="text-[12px] text-grey-medium">
                      Нет активных типов. Создайте их в разделе «Календарь
                      Коуча».
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeSlotTypes.map((t) => {
                        const checked = watched.slotTypeIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? watched.slotTypeIds.filter(
                                    (id) => id !== t.id,
                                  )
                                : [...watched.slotTypeIds, t.id];
                              setValue("slotTypeIds", next, {
                                shouldValidate: true,
                              });
                            }}
                            style={
                              checked
                                ? {
                                    backgroundColor: `${t.color}1F`,
                                    borderColor: t.color,
                                    color: t.color,
                                  }
                                : undefined
                            }
                            className={clsx(
                              "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
                              !checked &&
                                "border-[rgba(102,112,133,0.3)] bg-white text-grey-dark hover:bg-grey-lighter",
                            )}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {errors.slotTypeIds && (
                    <p className="text-[12px] text-red-error">
                      {errors.slotTypeIds.message as string}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-[8px] border border-[#EAECF0] p-4">
            <label
              className={clsx(
                "flex items-center justify-between gap-3",
                watched.bookingEnabled
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              )}
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-grey-dark">
                  Срок доступа после оплаты
                </span>
                <span className="text-[12px] text-grey-medium">
                  {watched.bookingEnabled
                    ? "Не применяется к бронируемым товарам"
                    : "Например, курс на 30 дней. Без срока — доступ навсегда."}
                </span>
              </div>
              <Toggle
                checked={watched.activeDurationDays.trim() !== ""}
                disabled={watched.bookingEnabled}
                onChange={(v) => {
                  setValue("activeDurationDays", v ? "30" : "", {
                    shouldValidate: true,
                  });
                }}
              />
            </label>
            {!watched.bookingEnabled &&
              watched.activeDurationDays.trim() !== "" && (
                <Input
                  fullWidth
                  label="Дней"
                  inputMode="numeric"
                  placeholder="30"
                  {...register("activeDurationDays")}
                  error={errors.activeDurationDays?.message}
                />
              )}
          </section>

        {generalError && (
          <p className="text-[13px] text-red-error">{generalError}</p>
        )}
      </form>
    </Drawer>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex flex-1 cursor-pointer items-center justify-between gap-2">
      <span className="text-[13px] font-medium text-grey-dark">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

function SecondaryButton({
  onClick,
  children,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "cursor-pointer rounded-[8px] border border-purple-primary bg-purple-tertiary/20 px-4 py-2 text-[13px] font-medium text-purple-primary"
          : "cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[13px] font-medium text-grey-medium hover:bg-grey-lighter"
      }
    >
      {children}
    </button>
  );
}
