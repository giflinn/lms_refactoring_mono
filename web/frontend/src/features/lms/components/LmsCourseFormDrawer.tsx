import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Drawer } from "../../../components/ui/Drawer";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { LmsApiError, type LmsCourse } from "../api";
import { useCreateLmsCourse, useUpdateLmsCourse } from "../queries";

const apiBase = import.meta.env.VITE_API_URL as string;

function resolveCoverSrc(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${apiBase}${path}` : path;
}

type Props = {
  open: boolean;
  course: LmsCourse | null;
  onClose: () => void;
};

// Mirrors ProductFormDrawer: right-side drawer, title + description + optional
// cover image. The course tree (modules / lessons) is edited on its own page
// to keep this drawer narrow.
export function LmsCourseFormDrawer({ open, course, onClose }: Props) {
  const isEdit = course !== null;

  const create = useCreateLmsCourse();
  const update = useUpdateLmsCourse();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitleError(undefined);
    setGeneralError(undefined);
    setCoverFile(null);
    setPreviewUrl(null);
    setRemoveCover(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (course) {
      setTitle(course.title);
      setDescription(course.description ?? "");
    } else {
      setTitle("");
      setDescription("");
    }
  }, [open, course]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setCoverFile(f);
    setRemoveCover(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function onClearCover() {
    setCoverFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (course?.coverImageUrl) setRemoveCover(true);
  }

  const submitting = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTitleError(undefined);
    setGeneralError(undefined);
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Введите название");
      return;
    }
    try {
      if (isEdit && course) {
        await update.mutateAsync({
          id: course.id,
          input: {
            title: trimmed,
            description: description.trim() || null,
            coverFile,
            removeCover: removeCover && !coverFile,
          },
        });
      } else {
        await create.mutateAsync({
          title: trimmed,
          description: description.trim() || null,
          coverFile,
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof LmsApiError) {
        if (err.code === "title_required" || err.code === "title_too_long") {
          setTitleError(
            err.code === "title_too_long"
              ? "Слишком длинное название"
              : "Введите название",
          );
        } else if (err.code === "description_too_long") {
          setGeneralError("Описание слишком длинное.");
        } else {
          setGeneralError("Не удалось сохранить курс.");
        }
      } else {
        setGeneralError("Нет соединения с сервером.");
      }
    }
  }

  const existingCover = course?.coverImageUrl
    ? resolveCoverSrc(course.coverImageUrl)
    : null;
  const showCover = previewUrl ?? (removeCover ? null : existingCover);

  return (
    <Drawer
      open={open}
      title={isEdit ? "Редактировать курс" : "Новый курс"}
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="lms-course-form"
          disabled={submitting}
        >
          {submitting
            ? isEdit
              ? "Сохраняем…"
              : "Создаём…"
            : isEdit
              ? "Сохранить"
              : "Создать"}
        </Button>
      }
    >
      <form
        id="lms-course-form"
        onSubmit={onSubmit}
        className="flex flex-col gap-4 pb-2"
      >
        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-medium text-grey-medium">
            Обложка
          </label>
          <div className="flex items-center gap-3">
            <div className="relative h-[88px] w-[120px] shrink-0 overflow-hidden rounded-[8px] bg-purple-tertiary/30">
              {showCover ? (
                <img
                  src={showCover}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-purple-primary">
                  <ImagePlus size={22} strokeWidth={1.5} />
                </div>
              )}
              {showCover && (
                <button
                  type="button"
                  onClick={onClearCover}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-grey-dark hover:bg-white cursor-pointer"
                  aria-label="Убрать обложку"
                >
                  <X size={14} strokeWidth={1.7} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 py-2 text-[13px] font-medium text-grey-dark hover:bg-grey-lighter cursor-pointer"
            >
              {showCover ? "Заменить" : "Загрузить"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
        </div>

        <Input
          fullWidth
          label="Название*"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={titleError}
        />

        <Textarea
          label="Описание"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {generalError && (
          <p className="text-[13px] text-red-error">{generalError}</p>
        )}
      </form>
    </Drawer>
  );
}
