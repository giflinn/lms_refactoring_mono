import { useEffect, useRef, useState } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
import { Drawer } from "../../../components/ui/Drawer";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  LmsApiError,
  type LmsLessonAttachment,
  type LmsLessonSummary,
} from "../api";
import {
  useCreateLmsLesson,
  useDeleteLessonAttachment,
  useLmsLesson,
  useUpdateLmsLesson,
  useUploadLessonAttachment,
} from "../queries";
import { RichTextEditor } from "./RichTextEditor";

type Props = {
  open: boolean;
  courseId: string;
  moduleId: string;
  lesson: LmsLessonSummary | null;
  onClose: () => void;
};

// Wide drawer (uses the same right-side Drawer chrome as products) with the
// rich-text editor and the PDF attachments list. On edit we lazily load the
// full lesson — the list endpoint omits content and attachments to keep
// payloads small. Attachments can only be uploaded for an existing lesson
// (we need a lesson id to associate them with), so the section shows a hint
// in the "new lesson" mode until the user saves it.
export function LmsLessonFormDrawer({
  open,
  courseId,
  moduleId,
  lesson,
  onClose,
}: Props) {
  const isEdit = lesson !== null;
  const lessonQ = useLmsLesson(open && isEdit ? lesson.id : null);
  const create = useCreateLmsLesson(courseId);
  const update = useUpdateLmsLesson(courseId);

  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();

  // Reset when opening for a different lesson / mode. For edit we wait for
  // the GET to land before hydrating the editor.
  useEffect(() => {
    if (!open) return;
    setTitleError(undefined);
    setGeneralError(undefined);
    if (!isEdit) {
      setTitle("");
      setHtml("");
      return;
    }
    if (lessonQ.data) {
      setTitle(lessonQ.data.title);
      setHtml(lessonQ.data.contentHtml);
    } else if (lesson) {
      setTitle(lesson.title);
    }
  }, [open, isEdit, lesson, lessonQ.data]);

  const submitting = create.isPending || update.isPending;
  const loadingExisting = isEdit && lessonQ.isLoading;

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
      if (isEdit && lesson) {
        await update.mutateAsync({
          id: lesson.id,
          title: trimmed,
          contentHtml: html,
        });
      } else {
        await create.mutateAsync({
          moduleId,
          title: trimmed,
          contentHtml: html,
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof LmsApiError) {
        if (err.code === "title_too_long") {
          setTitleError("Слишком длинное название");
        } else if (err.code === "content_too_long") {
          setGeneralError("Контент урока слишком большой.");
        } else {
          setGeneralError("Не удалось сохранить урок.");
        }
      } else {
        setGeneralError("Нет соединения с сервером.");
      }
    }
  }

  return (
    <Drawer
      open={open}
      title={isEdit ? "Редактировать урок" : "Новый урок"}
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="lms-lesson-form"
          disabled={submitting || loadingExisting}
        >
          {submitting
            ? "Сохраняем…"
            : isEdit
              ? "Сохранить"
              : "Создать"}
        </Button>
      }
    >
      {loadingExisting ? (
        <p className="text-[13px] text-grey-medium">Загружаем урок…</p>
      ) : (
        <form
          id="lms-lesson-form"
          onSubmit={onSubmit}
          className="flex flex-col gap-4 pb-2"
        >
          <Input
            fullWidth
            label="Название урока*"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-grey-medium">
              Контент
            </span>
            <RichTextEditor value={html} onChange={setHtml} />
          </div>
          <AttachmentsSection
            lessonId={isEdit && lesson ? lesson.id : null}
            attachments={lessonQ.data?.attachments ?? []}
          />
          {generalError && (
            <p className="text-[13px] text-red-error">{generalError}</p>
          )}
        </form>
      )}
    </Drawer>
  );
}

function AttachmentsSection({
  lessonId,
  attachments,
}: {
  lessonId: string | null;
  attachments: LmsLessonAttachment[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | undefined>();
  // null = no pending delete; uuid string = "are you sure" flipped onto that
  // row. Click-twice-to-confirm avoids a modal but still prevents a single
  // misclick from deleting.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const upload = useUploadLessonAttachment(lessonId ?? "");
  const remove = useDeleteLessonAttachment(lessonId ?? "");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !lessonId) return;
    setError(undefined);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      if (err instanceof LmsApiError) {
        if (err.code === "unsupported_mime_type") {
          setError("Только PDF-файлы.");
        } else if (err.code === "LIMIT_FILE_SIZE") {
          setError("Файл больше 50 МБ.");
        } else {
          setError("Не удалось загрузить файл.");
        }
      } else {
        setError("Нет соединения с сервером.");
      }
    }
  }

  async function onConfirmDelete(id: string) {
    setError(undefined);
    try {
      await remove.mutateAsync(id);
      setPendingDelete(null);
    } catch {
      setError("Не удалось удалить файл.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-grey-medium">
        PDF-материалы
      </span>
      {lessonId === null ? (
        <p className="text-[12px] text-grey-medium">
          Сохраните урок, чтобы добавить вложения.
        </p>
      ) : (
        <>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-grey-light bg-white px-2.5 py-2"
                >
                  <FileText
                    size={16}
                    className="shrink-0 text-purple-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-grey-dark">
                      {a.fileName}
                    </p>
                    <p className="text-[11px] text-grey-medium">
                      {formatBytes(a.sizeBytes)}
                    </p>
                  </div>
                  {pendingDelete === a.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(a.id)}
                        disabled={remove.isPending}
                        className="text-[12px] font-medium text-red-error hover:underline disabled:opacity-50"
                      >
                        Удалить
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="text-[12px] text-grey-medium hover:underline"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <a
                        href={`${import.meta.env.VITE_API_URL}/lms-attachments/${a.urlPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Открыть"
                        className="rounded p-1 text-grey-medium hover:bg-grey-light hover:text-purple-primary"
                      >
                        <Download size={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(a.id)}
                        title="Удалить"
                        className="rounded p-1 text-grey-medium hover:bg-grey-light hover:text-red-error"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={onPick}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="self-start rounded-md border border-dashed border-grey-medium px-3 py-1.5 text-[12px] text-grey-dark hover:border-purple-primary hover:text-purple-primary disabled:opacity-50"
          >
            {upload.isPending ? "Загружаем…" : "+ Добавить PDF"}
          </button>
          {error && <p className="text-[12px] text-red-error">{error}</p>}
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
