import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  archiveCourse,
  createCourse,
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  getCourse,
  getLesson,
  listCourses,
  listCoursesPicker,
  reorderLessons,
  reorderModules,
  updateCourse,
  updateLesson,
  updateModule,
  uploadMedia,
  type LmsCourseInput,
  type LmsLessonFull,
  type LmsModule,
} from "./api";

const COURSES_KEY = ["lms", "courses"] as const;
const PICKER_KEY = ["lms", "courses", "picker"] as const;
const courseDetailKey = (id: string) => ["lms", "courses", id] as const;
const lessonKey = (id: string) => ["lms", "lessons", id] as const;

async function token(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function useLmsCourses() {
  return useQuery({
    queryKey: COURSES_KEY,
    queryFn: async () => listCourses(await token()),
  });
}

export function useLmsCoursesPicker(enabled: boolean) {
  return useQuery({
    queryKey: PICKER_KEY,
    queryFn: async () => listCoursesPicker(await token()),
    enabled,
    staleTime: 60_000,
  });
}

export function useLmsCourseDetail(id: string | null) {
  return useQuery({
    queryKey: id ? courseDetailKey(id) : ["lms", "courses", "none"],
    queryFn: async () => {
      if (!id) throw new Error("course_id_missing");
      return getCourse(await token(), id);
    },
    enabled: !!id,
  });
}

export function useCreateLmsCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LmsCourseInput) =>
      createCourse(await token(), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSES_KEY });
      qc.invalidateQueries({ queryKey: PICKER_KEY });
    },
  });
}

export function useUpdateLmsCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: LmsCourseInput;
    }) => updateCourse(await token(), id, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: COURSES_KEY });
      qc.invalidateQueries({ queryKey: PICKER_KEY });
      qc.invalidateQueries({ queryKey: courseDetailKey(vars.id) });
    },
  });
}

export function useArchiveLmsCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => archiveCourse(await token(), id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSES_KEY });
      qc.invalidateQueries({ queryKey: PICKER_KEY });
    },
  });
}

// ---------- Modules ----------

export function useCreateLmsModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) =>
      createModule(await token(), courseId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

export function useUpdateLmsModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; title: string }) =>
      updateModule(await token(), vars.id, vars.title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

export function useDeleteLmsModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => deleteModule(await token(), id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

export function useReorderLmsModules(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      reorderModules(await token(), courseId, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: courseDetailKey(courseId) });
      const prev = qc.getQueryData<{ modules: LmsModule[] }>(
        courseDetailKey(courseId),
      );
      if (prev) {
        const map = new Map(prev.modules.map((m) => [m.id, m]));
        qc.setQueryData(courseDetailKey(courseId), {
          ...prev,
          modules: ids
            .map((id, i) => {
              const m = map.get(id);
              if (!m) return null;
              return { ...m, sortOrder: i };
            })
            .filter(Boolean),
        });
      }
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(courseDetailKey(courseId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

// ---------- Lessons ----------

export function useLmsLesson(id: string | null) {
  return useQuery({
    queryKey: id ? lessonKey(id) : ["lms", "lessons", "none"],
    queryFn: async () => {
      if (!id) throw new Error("lesson_id_missing");
      return getLesson(await token(), id);
    },
    enabled: !!id,
  });
}

export function useCreateLmsLesson(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      moduleId: string;
      title: string;
      contentHtml: string;
    }) =>
      createLesson(await token(), vars.moduleId, {
        title: vars.title,
        contentHtml: vars.contentHtml,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

export function useUpdateLmsLesson(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      title?: string;
      contentHtml?: string;
    }) =>
      updateLesson(await token(), vars.id, {
        title: vars.title,
        contentHtml: vars.contentHtml,
      }),
    onSuccess: (data: LmsLessonFull) => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
      qc.setQueryData(lessonKey(data.id), data);
    },
  });
}

export function useDeleteLmsLesson(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => deleteLesson(await token(), id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

export function useReorderLmsLessons(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { moduleId: string; ids: string[] }) =>
      reorderLessons(await token(), vars.moduleId, vars.ids),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: courseDetailKey(courseId) });
    },
  });
}

// ---------- Media ----------

export function useUploadLmsMedia() {
  return useMutation({
    mutationFn: async (file: File) => uploadMedia(await token(), file),
  });
}
