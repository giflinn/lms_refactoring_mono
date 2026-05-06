import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Upload, X } from "lucide-react";
import type {
  Control,
  FieldErrors,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import { useController } from "react-hook-form";
import { Toggle } from "../../../components/ui/Toggle";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import type { ProductFormValues } from "../schema";

const VIDEO_API_BASE = import.meta.env.VITE_API_URL as string;

type Props = {
  control: Control<ProductFormValues>;
  watch: UseFormWatch<ProductFormValues>;
  setValue: UseFormSetValue<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  // Pending file picked in this submit (controlled by parent so it lives
  // alongside coverFile and gets passed to the mutation untouched).
  videoFile: File | null;
  onPickVideo: (file: File | null) => void;
};

const SOURCE_TABS: { id: "upload" | "youtube"; label: string }[] = [
  { id: "upload", label: "Загрузить файл" },
  { id: "youtube", label: "YouTube ссылка" },
];

const DISPLAY_TABS: { id: "replace" | "below"; label: string }[] = [
  { id: "replace", label: "Вместо обложки" },
  { id: "below", label: "Под обложкой" },
];

export function ProductVideoSection({
  control,
  watch,
  setValue,
  errors,
  videoFile,
  onPickVideo,
}: Props) {
  const enabled = watch("videoEnabled");
  const source = watch("videoSource");
  const url = watch("videoUrl");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  // Use a controller for videoUrl so RHF picks up the typed input.
  const urlController = useController({ control, name: "videoUrl" });

  // When the user toggles to YouTube, clear any pending uploaded file so the
  // server doesn't get confused. Same the other direction — clear the URL.
  useEffect(() => {
    if (!enabled) return;
    if (source === "youtube") {
      onPickVideo(null);
      setPreviewName(null);
    } else if (source === "upload") {
      // Only clear the URL if it's currently a YouTube one — preserve the
      // existing /product-videos/ path so the server keeps the uploaded file
      // when the user hasn't picked a new one yet.
      if (url && !url.startsWith("/product-videos/")) {
        setValue("videoUrl", "", { shouldDirty: true });
      }
    }
  }, [source, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    onPickVideo(f);
    setPreviewName(f.name);
    // Clear the URL so server treats this as a fresh upload, not "keep old".
    setValue("videoUrl", "", { shouldDirty: true });
  }

  function clearPickedFile() {
    onPickVideo(null);
    setPreviewName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Show an existing uploaded file (when not picking a new one) as a hint so
  // the admin doesn't think the file is gone.
  const existingUploadedUrl =
    !videoFile && url && url.startsWith("/product-videos/")
      ? `${VIDEO_API_BASE}${url}`
      : null;

  return (
    <section className="flex flex-col gap-3 rounded-[8px] border border-[rgba(102,112,133,0.2)] p-4">
      <label className="flex cursor-pointer items-center justify-between gap-2">
        <span className="text-[14px] font-medium text-[#0E131F]">
          Видеообложка
        </span>
        <Toggle
          checked={enabled}
          onChange={(v) => setValue("videoEnabled", v, { shouldDirty: true })}
        />
      </label>
      <p className="text-[12px] text-grey-medium">
        Опциональное видео на детальной странице товара. До&nbsp;50&nbsp;MB
        для загруженного файла; YouTube — без ограничений.
      </p>

      {enabled && (
        <div className="mt-1 flex flex-col gap-3">
          <SegmentedTabs<"upload" | "youtube">
            tabs={SOURCE_TABS}
            value={source}
            onChange={(v) =>
              setValue("videoSource", v, { shouldDirty: true })
            }
            className="self-start"
          />

          {source === "upload" && (
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handlePickFile}
              />
              {videoFile || existingUploadedUrl ? (
                <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-grey-lighter px-3 py-2 text-[13px] text-grey-dark">
                  <span className="min-w-0 truncate">
                    {videoFile?.name ?? previewName ?? "Текущий файл"}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer text-[13px] font-medium text-purple-primary hover:opacity-90"
                    >
                      Заменить
                    </button>
                    {videoFile && (
                      <button
                        type="button"
                        onClick={clearPickedFile}
                        className="cursor-pointer text-grey-medium hover:text-grey-dark"
                        aria-label="Убрать выбранный файл"
                      >
                        <X size={16} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-dashed border-[rgba(102,112,133,0.4)] bg-white px-4 text-[14px] font-medium text-grey-dark hover:border-purple-primary hover:text-purple-primary"
                >
                  <Upload size={16} strokeWidth={1.75} />
                  Выбрать файл
                </button>
              )}
            </div>
          )}

          {source === "youtube" && (
            <div className="flex flex-col gap-1">
              <input
                type="url"
                placeholder="https://youtu.be/… или https://youtube.com/watch?v=…"
                value={urlController.field.value}
                onChange={(e) => urlController.field.onChange(e.target.value)}
                onBlur={urlController.field.onBlur}
                className={clsx(
                  "h-9 w-full rounded-[8px] border bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary",
                  errors.videoUrl
                    ? "border-red-500"
                    : "border-[rgba(102,112,133,0.3)]",
                )}
              />
              {errors.videoUrl?.message && (
                <span className="text-[12px] text-red-error">
                  {String(errors.videoUrl.message)}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-grey-dark">
              Где показывать
            </span>
            <SegmentedTabs<"replace" | "below">
              tabs={DISPLAY_TABS}
              value={watch("videoDisplay")}
              onChange={(v) =>
                setValue("videoDisplay", v, { shouldDirty: true })
              }
              className="self-start"
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[14px] text-grey-dark">
              Автовоспроизведение
              <span className="ml-2 text-[12px] text-grey-medium">
                (на мобильном — без звука)
              </span>
            </span>
            <Toggle
              checked={watch("videoAutoplay")}
              onChange={(v) =>
                setValue("videoAutoplay", v, { shouldDirty: true })
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
