import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import clsx from "clsx";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  Plus,
  Trash2,
} from "lucide-react";
import { PageActionButton } from "../../../components/ui/PageActionButton";
import {
  useDeleteLmsLesson,
  useDeleteLmsModule,
  useLmsCourseDetail,
  useReorderLmsLessons,
  useReorderLmsModules,
} from "../queries";
import type { LmsLessonSummary, LmsModule } from "../api";
import { LmsModuleFormDialog } from "../components/LmsModuleFormDialog";
import { LmsLessonFormDrawer } from "../components/LmsLessonFormDrawer";

// /settings/lms/:courseId — full screen with the course title up top, then a
// vertical list of modules. Each module expands to its lessons inline (so the
// admin can re-order without flipping pages). Mirrors the visual density of
// the rest of the admin: dense rows, purple primary, grey-50 background.
export function LmsCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const detail = useLmsCourseDetail(courseId ?? null);

  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<LmsModule | null>(null);

  const [lessonDrawerOpen, setLessonDrawerOpen] = useState(false);
  const [lessonDrawerModuleId, setLessonDrawerModuleId] = useState<string | null>(
    null,
  );
  const [editingLesson, setEditingLesson] = useState<LmsLessonSummary | null>(
    null,
  );

  if (!courseId) return null;

  if (detail.isLoading) {
    return <PageShell><p className="text-grey-medium text-[14px]">Загрузка…</p></PageShell>;
  }
  if (detail.isError || !detail.data) {
    return (
      <PageShell>
        <p className="text-red-error text-[14px]">
          Не удалось загрузить курс.
        </p>
      </PageShell>
    );
  }

  const { course, modules } = detail.data;

  const openCreateModule = () => {
    setEditingModule(null);
    setModuleDialogOpen(true);
  };
  const openEditModule = (m: LmsModule) => {
    setEditingModule(m);
    setModuleDialogOpen(true);
  };
  const openCreateLesson = (moduleId: string) => {
    setEditingLesson(null);
    setLessonDrawerModuleId(moduleId);
    setLessonDrawerOpen(true);
  };
  const openEditLesson = (moduleId: string, lesson: LmsLessonSummary) => {
    setEditingLesson(lesson);
    setLessonDrawerModuleId(moduleId);
    setLessonDrawerOpen(true);
  };

  return (
    <PageShell>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Link
            to="/settings"
            className="flex w-fit items-center gap-1 text-[13px] text-grey-medium hover:text-grey-dark"
          >
            <ArrowLeft size={14} strokeWidth={1.7} /> Настройки
          </Link>
          <h1 className="text-[22px] font-semibold text-[#0E131F]">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-[14px] text-grey-medium max-w-[700px]">
              {course.description}
            </p>
          )}
        </div>
        <PageActionButton
          icon={<Plus size={20} strokeWidth={1.5} />}
          onClick={openCreateModule}
        >
          Добавить модуль
        </PageActionButton>
      </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-[rgba(102,112,133,0.3)] bg-white py-12 px-6 text-center">
          <p className="text-grey-dark text-[14px] font-medium">
            В курсе пока нет модулей
          </p>
          <p className="text-grey-medium text-[13px] mt-1 max-w-[420px]">
            Каждый модуль — это набор уроков. Добавьте первый модуль и
            наполните его уроками.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((m, i) => (
            <ModuleCard
              key={m.id}
              courseId={courseId}
              module={m}
              moduleIds={modules.map((x) => x.id)}
              indexInList={i}
              onEdit={() => openEditModule(m)}
              onAddLesson={() => openCreateLesson(m.id)}
              onEditLesson={(lesson) => openEditLesson(m.id, lesson)}
            />
          ))}
        </div>
      )}

      <LmsModuleFormDialog
        open={moduleDialogOpen}
        courseId={courseId}
        module={editingModule}
        onClose={() => setModuleDialogOpen(false)}
      />
      <LmsLessonFormDrawer
        open={lessonDrawerOpen}
        courseId={courseId}
        moduleId={lessonDrawerModuleId ?? ""}
        lesson={editingLesson}
        onClose={() => setLessonDrawerOpen(false)}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6 pt-4 pb-8">{children}</div>;
}

function ModuleCard({
  courseId,
  module,
  moduleIds,
  indexInList,
  onEdit,
  onAddLesson,
  onEditLesson,
}: {
  courseId: string;
  module: LmsModule & { lessons: LmsLessonSummary[] };
  moduleIds: string[];
  indexInList: number;
  onEdit: () => void;
  onAddLesson: () => void;
  onEditLesson: (lesson: LmsLessonSummary) => void;
}) {
  const reorderModules = useReorderLmsModules(courseId);
  const reorderLessons = useReorderLmsLessons(courseId);
  const deleteModule = useDeleteLmsModule(courseId);
  const deleteLesson = useDeleteLmsLesson(courseId);

  const isFirstModule = indexInList === 0;
  const isLastModule = indexInList === moduleIds.length - 1;

  const moveModule = (delta: -1 | 1) => {
    const next = [...moduleIds];
    const j = indexInList + delta;
    if (j < 0 || j >= next.length) return;
    [next[indexInList], next[j]] = [next[j], next[indexInList]];
    reorderModules.mutate(next);
  };

  const moveLesson = (lessonIndex: number, delta: -1 | 1) => {
    const ids = module.lessons.map((l) => l.id);
    const j = lessonIndex + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[lessonIndex], ids[j]] = [ids[j], ids[lessonIndex]];
    reorderLessons.mutate({ moduleId: module.id, ids });
  };

  const onDeleteModule = async () => {
    if (
      !window.confirm(
        `Удалить модуль "${module.title}"? Все уроки в нём также удалятся.`,
      )
    ) {
      return;
    }
    try {
      await deleteModule.mutateAsync(module.id);
      toast.success("Модуль удалён");
    } catch {
      toast.error("Не удалось удалить");
    }
  };

  const onDeleteLesson = async (lesson: LmsLessonSummary) => {
    if (!window.confirm(`Удалить урок "${lesson.title}"?`)) return;
    try {
      await deleteLesson.mutateAsync(lesson.id);
      toast.success("Урок удалён");
    } catch {
      toast.error("Не удалось удалить");
    }
  };

  return (
    <div className="overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white">
      <div className="flex items-center gap-2 border-b border-[#EAECF0] bg-grey-lighter px-4 py-3">
        <ReorderButtons
          onUp={() => moveModule(-1)}
          onDown={() => moveModule(1)}
          disabledUp={isFirstModule}
          disabledDown={isLastModule}
        />
        <span className="font-medium text-grey-dark flex-1 truncate">
          {module.title}
        </span>
        <span className="text-[12px] text-grey-medium">
          {module.lessons.length} урок{plural(module.lessons.length)}
        </span>
        <RowAction icon={<Edit3 size={15} />} onClick={onEdit} title="Изменить" />
        <RowAction
          icon={<Trash2 size={15} />}
          onClick={onDeleteModule}
          title="Удалить"
          destructive
        />
      </div>
      <div className="flex flex-col">
        {module.lessons.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-grey-medium">
            В модуле пока нет уроков.
          </p>
        ) : (
          module.lessons.map((lesson, i) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              first={i === 0}
              last={i === module.lessons.length - 1}
              onMoveUp={() => moveLesson(i, -1)}
              onMoveDown={() => moveLesson(i, 1)}
              onEdit={() => onEditLesson(lesson)}
              onDelete={() => onDeleteLesson(lesson)}
            />
          ))
        )}
        <button
          type="button"
          onClick={onAddLesson}
          className="flex items-center gap-2 border-t border-[#EAECF0] px-4 py-3 text-[13px] font-medium text-purple-primary hover:bg-purple-tertiary/10 cursor-pointer"
        >
          <Plus size={15} strokeWidth={1.7} /> Добавить урок
        </button>
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  first,
  last,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  lesson: LmsLessonSummary;
  first: boolean;
  last: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-[#EAECF0] px-4 py-2.5 hover:bg-grey-lighter/50">
      <ReorderButtons
        onUp={onMoveUp}
        onDown={onMoveDown}
        disabledUp={first}
        disabledDown={last}
      />
      <FileText size={14} strokeWidth={1.5} className="text-grey-medium" />
      <button
        type="button"
        onClick={onEdit}
        className="flex-1 truncate text-left text-[14px] text-grey-dark hover:text-purple-primary cursor-pointer"
      >
        {lesson.title}
      </button>
      <RowAction icon={<Edit3 size={15} />} onClick={onEdit} title="Изменить" />
      <RowAction
        icon={<Trash2 size={15} />}
        onClick={onDelete}
        title="Удалить"
        destructive
      />
    </div>
  );
}

function ReorderButtons({
  onUp,
  onDown,
  disabledUp,
  disabledDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disabledUp: boolean;
  disabledDown: boolean;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={disabledUp}
        className={clsx(
          "flex h-4 w-5 items-center justify-center rounded-[4px] cursor-pointer text-grey-medium hover:text-grey-dark hover:bg-white",
          disabledUp && "opacity-30 cursor-not-allowed",
        )}
        aria-label="Вверх"
      >
        <ChevronUp size={12} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disabledDown}
        className={clsx(
          "flex h-4 w-5 items-center justify-center rounded-[4px] cursor-pointer text-grey-medium hover:text-grey-dark hover:bg-white",
          disabledDown && "opacity-30 cursor-not-allowed",
        )}
        aria-label="Вниз"
      >
        <ChevronDown size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

function RowAction({
  icon,
  onClick,
  title,
  destructive,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={clsx(
        "rounded-[6px] p-1.5 cursor-pointer transition-colors",
        destructive
          ? "text-grey-medium hover:bg-red-50 hover:text-red-error"
          : "text-grey-medium hover:bg-white hover:text-grey-dark",
      )}
    >
      {icon}
    </button>
  );
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "а";
  return "ов";
}
