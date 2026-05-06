import { useMemo, useState } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArchiveRestore, BookOpen, Plus } from "lucide-react";
import { PageActionButton } from "../../../components/ui/PageActionButton";
import {
  useArchiveLmsCourse,
  useLmsCourses,
  useUpdateLmsCourse,
} from "../queries";
import type { LmsCourse } from "../api";
import { LmsCourseFormDrawer } from "./LmsCourseFormDrawer";

const apiBase = import.meta.env.VITE_API_URL as string;

function resolveCoverSrc(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${apiBase}${path}` : path;
}

// "Курсы LMS" card. Lists every course (active first, archived in a fold).
// Click a row → opens /settings/lms/:id (full page with modules + lessons).
// "Добавить" opens a right drawer for cover + title + description.
export function LmsCoursesSection() {
  const courses = useLmsCourses();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LmsCourse | null>(null);

  const { active, archived } = useMemo(() => {
    const list = courses.data ?? [];
    return {
      active: list.filter((c) => !c.archivedAt),
      archived: list.filter((c) => c.archivedAt),
    };
  }, [courses.data]);

  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-semibold text-[#0E131F]">
          Курсы LMS
        </h2>
        <PageActionButton
          icon={<Plus size={20} strokeWidth={1.5} />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          Добавить курс
        </PageActionButton>
      </div>

      {courses.isLoading ? (
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      ) : courses.isError ? (
        <p className="text-red-500 text-[14px]">
          Не удалось загрузить курсы.
        </p>
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <CourseList
            courses={active}
            onEdit={(c) => {
              setEditing(c);
              setDrawerOpen(true);
            }}
          />
          {archived.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-[14px] font-medium text-grey-medium hover:text-grey-dark">
                Архив ({archived.length})
              </summary>
              <div className="mt-3">
                <CourseList
                  courses={archived}
                  archivedView
                  onEdit={(c) => {
                    setEditing(c);
                    setDrawerOpen(true);
                  }}
                />
              </div>
            </details>
          )}
        </>
      )}

      <LmsCourseFormDrawer
        open={drawerOpen}
        course={editing}
        onClose={() => setDrawerOpen(false)}
      />
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[rgba(102,112,133,0.3)] py-10 px-6 text-center">
      <BookOpen size={28} strokeWidth={1.5} className="text-grey-medium mb-2" />
      <p className="text-grey-dark text-[14px] font-medium">
        Пока ни одного курса
      </p>
      <p className="text-grey-medium text-[13px] mt-1 max-w-[420px]">
        Создайте курс, добавьте в него модули и уроки. Затем привяжите курс к
        товару — клиент получит к нему доступ после оплаты.
      </p>
    </div>
  );
}

function CourseList({
  courses,
  archivedView,
  onEdit,
}: {
  courses: LmsCourse[];
  archivedView?: boolean;
  onEdit: (c: LmsCourse) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[rgba(102,112,133,0.2)]">
      <div className="grid grid-cols-[60px_2fr_1fr_140px] bg-grey-lighter px-4 py-2 text-[12px] font-semibold text-grey-medium uppercase tracking-wide">
        <div />
        <div>Название</div>
        <div>Привязано к товарам</div>
        <div className="text-right">Действия</div>
      </div>
      {courses.map((c) => (
        <CourseRow
          key={c.id}
          course={c}
          archivedView={Boolean(archivedView)}
          onEdit={() => onEdit(c)}
        />
      ))}
    </div>
  );
}

function CourseRow({
  course,
  archivedView,
  onEdit,
}: {
  course: LmsCourse;
  archivedView: boolean;
  onEdit: () => void;
}) {
  const archive = useArchiveLmsCourse();
  const update = useUpdateLmsCourse();

  const onToggleArchive = async () => {
    try {
      if (archivedView) {
        await update.mutateAsync({
          id: course.id,
          input: {
            title: course.title,
            description: course.description,
            coverFile: null,
            archived: false,
          },
        });
        toast.success("Курс восстановлен");
      } else {
        await archive.mutateAsync(course.id);
        toast.success("Перенесено в архив");
      }
    } catch {
      toast.error("Не удалось изменить");
    }
  };

  const cover = resolveCoverSrc(course.coverImageUrl);

  return (
    <div
      className={clsx(
        "grid grid-cols-[60px_2fr_1fr_140px] items-center border-t border-[#EAECF0] px-4 py-3 text-[13px]",
        archivedView && "opacity-60",
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[8px] bg-purple-tertiary/40">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <BookOpen
            size={18}
            strokeWidth={1.5}
            className="text-purple-primary"
          />
        )}
      </div>
      <div className="flex flex-col pr-3">
        <Link
          to={`/settings/lms/${course.id}`}
          className="font-medium text-grey-dark hover:text-purple-primary truncate"
        >
          {course.title}
        </Link>
        {course.description && (
          <span className="text-[12px] text-grey-medium truncate">
            {course.description}
          </span>
        )}
      </div>
      <div className="text-grey-dark">
        {course.productsCount > 0
          ? `${course.productsCount} товар${plural(course.productsCount)}`
          : "—"}
      </div>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-grey-medium hover:bg-grey-lighter hover:text-grey-dark cursor-pointer"
        >
          Изменить
        </button>
        <button
          type="button"
          onClick={onToggleArchive}
          disabled={archive.isPending || update.isPending}
          className="rounded-[6px] p-1.5 text-grey-medium hover:bg-grey-lighter hover:text-grey-dark cursor-pointer disabled:opacity-50"
          title={archivedView ? "Восстановить" : "В архив"}
          aria-label={archivedView ? "Восстановить" : "В архив"}
        >
          {archivedView ? (
            <ArchiveRestore size={16} strokeWidth={1.5} />
          ) : (
            <Archive size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "а";
  return "ов";
}
