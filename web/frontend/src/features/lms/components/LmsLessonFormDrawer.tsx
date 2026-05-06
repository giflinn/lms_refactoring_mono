import { useEffect, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { LmsApiError, type LmsLessonSummary } from "../api";
import {
  useCreateLmsLesson,
  useLmsLesson,
  useUpdateLmsLesson,
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
// rich-text editor at the bottom. On edit we lazily load the lesson HTML —
// the list endpoint omits content to keep payloads small.
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
          {generalError && (
            <p className="text-[13px] text-red-error">{generalError}</p>
          )}
        </form>
      )}
    </Drawer>
  );
}
