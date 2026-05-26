import { ApiClient, apiClient } from "../../api/client";

export class LmsApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const code = await ApiClient.parseErrorCode(res);
  throw new LmsApiError(code, res.status);
}

export type LmsCourse = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  archivedAt: string | null;
  productsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LmsCoursePickerItem = {
  id: string;
  title: string;
};

export type LmsModule = {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  lessonsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LmsLessonSummary = {
  id: string;
  moduleId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LmsLessonAttachment = {
  id: string;
  lessonId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  urlPath: string;
  sortOrder: number;
  createdAt: string;
};

export type LmsLessonFull = LmsLessonSummary & {
  contentHtml: string;
  attachments: LmsLessonAttachment[];
};

export type LmsCourseDetail = {
  course: LmsCourse;
  modules: (LmsModule & { lessons: LmsLessonSummary[] })[];
};

export type LmsCourseInput = {
  title: string;
  description: string | null;
  coverFile: File | null;
  removeCover?: boolean;
  archived?: boolean;
};

function courseFormData(input: LmsCourseInput): FormData {
  const fd = new FormData();
  fd.append("title", input.title);
  fd.append("description", input.description ?? "");
  if (input.coverFile) fd.append("cover", input.coverFile);
  if (input.removeCover) fd.append("removeCover", "true");
  if (input.archived !== undefined) {
    fd.append("archived", input.archived ? "true" : "false");
  }
  return fd;
}

// ---------- Courses ----------

export async function listCourses(idToken: string): Promise<LmsCourse[]> {
  const res = await apiClient.get("/lms/courses", idToken);
  await ensureOk(res);
  const json = (await res.json()) as { courses: LmsCourse[] };
  return json.courses;
}

export async function listCoursesPicker(
  idToken: string,
): Promise<LmsCoursePickerItem[]> {
  const res = await apiClient.get("/lms/courses/picker", idToken);
  await ensureOk(res);
  const json = (await res.json()) as { courses: LmsCoursePickerItem[] };
  return json.courses;
}

export async function getCourse(
  idToken: string,
  id: string,
): Promise<LmsCourseDetail> {
  const res = await apiClient.get(`/lms/courses/${id}`, idToken);
  await ensureOk(res);
  return (await res.json()) as LmsCourseDetail;
}

export async function createCourse(
  idToken: string,
  input: LmsCourseInput,
): Promise<LmsCourse> {
  const res = await apiClient.postFormData(
    "/lms/courses",
    courseFormData(input),
    idToken,
  );
  await ensureOk(res);
  const json = (await res.json()) as { course: LmsCourse };
  return json.course;
}

export async function updateCourse(
  idToken: string,
  id: string,
  input: LmsCourseInput,
): Promise<LmsCourse> {
  const res = await apiClient.patchFormData(
    `/lms/courses/${id}`,
    courseFormData(input),
    idToken,
  );
  await ensureOk(res);
  const json = (await res.json()) as { course: LmsCourse };
  return json.course;
}

export async function archiveCourse(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/lms/courses/${id}`, idToken);
  await ensureOk(res);
}

// ---------- Modules ----------

export async function createModule(
  idToken: string,
  courseId: string,
  title: string,
): Promise<LmsModule> {
  const res = await apiClient.postJson(
    `/lms/courses/${courseId}/modules`,
    { title },
    idToken,
  );
  await ensureOk(res);
  const json = (await res.json()) as { module: LmsModule };
  return json.module;
}

export async function updateModule(
  idToken: string,
  id: string,
  title: string,
): Promise<LmsModule> {
  const res = await apiClient.patchJson(`/lms/modules/${id}`, { title }, idToken);
  await ensureOk(res);
  const json = (await res.json()) as { module: LmsModule };
  return json.module;
}

export async function deleteModule(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/lms/modules/${id}`, idToken);
  await ensureOk(res);
}

export async function reorderModules(
  idToken: string,
  courseId: string,
  ids: string[],
): Promise<void> {
  const res = await apiClient.patchJson(
    `/lms/courses/${courseId}/modules/order`,
    { ids },
    idToken,
  );
  await ensureOk(res);
}

// ---------- Lessons ----------

export async function getLesson(
  idToken: string,
  id: string,
): Promise<LmsLessonFull> {
  const res = await apiClient.get(`/lms/lessons/${id}`, idToken);
  await ensureOk(res);
  const json = (await res.json()) as { lesson: LmsLessonFull };
  return json.lesson;
}

export async function createLesson(
  idToken: string,
  moduleId: string,
  input: { title: string; contentHtml: string },
): Promise<LmsLessonFull> {
  const res = await apiClient.postJson(
    `/lms/modules/${moduleId}/lessons`,
    input,
    idToken,
  );
  await ensureOk(res);
  const json = (await res.json()) as { lesson: LmsLessonFull };
  return json.lesson;
}

export async function updateLesson(
  idToken: string,
  id: string,
  input: { title?: string; contentHtml?: string },
): Promise<LmsLessonFull> {
  const res = await apiClient.patchJson(`/lms/lessons/${id}`, input, idToken);
  await ensureOk(res);
  const json = (await res.json()) as { lesson: LmsLessonFull };
  return json.lesson;
}

export async function deleteLesson(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/lms/lessons/${id}`, idToken);
  await ensureOk(res);
}

export async function reorderLessons(
  idToken: string,
  moduleId: string,
  ids: string[],
): Promise<void> {
  const res = await apiClient.patchJson(
    `/lms/modules/${moduleId}/lessons/order`,
    { ids },
    idToken,
  );
  await ensureOk(res);
}

// ---------- Media ----------

export type LmsMediaUploadResult = {
  url: string;
  mime: string;
  kind: "image" | "video" | "file";
};

export async function uploadMedia(
  idToken: string,
  file: File,
): Promise<LmsMediaUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiClient.postFormData("/lms/media", fd, idToken);
  await ensureOk(res);
  return (await res.json()) as LmsMediaUploadResult;
}

// ---------- Lesson attachments (PDF) ----------

export async function uploadLessonAttachment(
  idToken: string,
  lessonId: string,
  file: File,
): Promise<LmsLessonAttachment> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiClient.postFormData(
    `/lms/lessons/${lessonId}/attachments`,
    fd,
    idToken,
  );
  await ensureOk(res);
  const json = (await res.json()) as { attachment: LmsLessonAttachment };
  return json.attachment;
}

export async function deleteLessonAttachment(
  idToken: string,
  attachmentId: string,
): Promise<void> {
  const res = await apiClient.delete(
    `/lms/lesson-attachments/${attachmentId}`,
    idToken,
  );
  await ensureOk(res);
}
