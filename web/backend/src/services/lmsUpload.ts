import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { extForMime } from "./avatarUpload";

// Three flavours of LMS upload share this file:
//   1. lmsCoverUpload — single course cover image. Stored as
//      uploads/lms-covers/<course_id>.<ext>. Mirrors productImageUpload.
//   2. lmsMediaUpload — assets embedded inside a lesson's HTML body (images
//      and short videos uploaded from the TipTap editor). Stored under
//      uploads/lms-media/<uuid>.<ext>. The route returns the public URL and
//      the editor inlines it as <img>/<video>.
//   3. lmsAttachmentUpload — PDF materials hung off a lesson as a separate
//      list (not inlined in HTML). Stored under uploads/lms-attachments/<uuid>.pdf.
//      Mobile shows them in a screenshot-protected fullscreen viewer.
//
// All three directories are mounted via express.static in index.ts so the
// mobile + admin clients can fetch the binaries directly.

export const LMS_COVER_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "lms-covers",
);
export const LMS_MEDIA_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "lms-media",
);
export const LMS_ATTACHMENT_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "lms-attachments",
);

if (!fs.existsSync(LMS_COVER_DIR)) {
  fs.mkdirSync(LMS_COVER_DIR, { recursive: true });
}
if (!fs.existsSync(LMS_MEDIA_DIR)) {
  fs.mkdirSync(LMS_MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(LMS_ATTACHMENT_DIR)) {
  fs.mkdirSync(LMS_ATTACHMENT_DIR, { recursive: true });
}

const COVER_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MEDIA_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MEDIA_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const lmsCoverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!COVER_MIMES.has(file.mimetype)) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

export const lmsMediaUpload = multer({
  storage: multer.memoryStorage(),
  // 50MB ceiling. Tighter than physical disk limit so a stuck upload can't
  // fill the EC2 volume; loose enough for short tutorial clips. Long videos
  // should be hosted externally and embedded as iframes.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      !MEDIA_IMAGE_MIMES.has(file.mimetype) &&
      !MEDIA_VIDEO_MIMES.has(file.mimetype)
    ) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

function extForMediaMime(mime: string): string {
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return extForMime(mime);
}

export function lmsCoverUrlFor(filename: string): string {
  return `/lms-covers/${filename}`;
}

export function lmsMediaUrlFor(filename: string): string {
  return `/lms-media/${filename}`;
}

export async function persistLmsCover(
  courseId: string,
  file: Express.Multer.File,
): Promise<string> {
  const ext = extForMime(file.mimetype);
  for (const oldExt of ["jpg", "png", "webp"]) {
    if (oldExt === ext) continue;
    const oldPath = path.join(LMS_COVER_DIR, `${courseId}.${oldExt}`);
    await fs.promises.rm(oldPath, { force: true });
  }
  const filename = `${courseId}.${ext}`;
  await fs.promises.writeFile(
    path.join(LMS_COVER_DIR, filename),
    file.buffer,
  );
  return lmsCoverUrlFor(filename);
}

export async function deleteLmsCover(courseId: string): Promise<void> {
  for (const ext of ["jpg", "png", "webp"]) {
    const p = path.join(LMS_COVER_DIR, `${courseId}.${ext}`);
    await fs.promises.rm(p, { force: true });
  }
}

// Persists a media file under a fresh uuid and returns its public URL. The
// file is referenced from authored HTML so we never delete it server-side
// when a lesson is removed (that would orphan content; admins live with the
// disk cost and can clean up via a future cron if needed).
export async function persistLmsMedia(
  file: Express.Multer.File,
): Promise<{ url: string; mime: string }> {
  const ext = extForMediaMime(file.mimetype);
  const filename = `${randomUUID()}.${ext}`;
  await fs.promises.writeFile(
    path.join(LMS_MEDIA_DIR, filename),
    file.buffer,
  );
  return { url: lmsMediaUrlFor(filename), mime: file.mimetype };
}

export function isMediaImage(mime: string): boolean {
  return MEDIA_IMAGE_MIMES.has(mime);
}

export function isMediaVideo(mime: string): boolean {
  return MEDIA_VIDEO_MIMES.has(mime);
}

// ---------- lesson attachments (PDF) ----------

const ATTACHMENT_MIMES = new Set(["application/pdf"]);

export const lmsAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  // 50MB — matches lmsMediaUpload. PDFs of course materials shouldn't get
  // close to this; the ceiling exists to prevent a stuck upload from filling
  // the disk.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ATTACHMENT_MIMES.has(file.mimetype)) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

export function lmsAttachmentUrlFor(filename: string): string {
  return `/lms-attachments/${filename}`;
}

// Writes the PDF under a fresh uuid and returns metadata for persistence.
// We keep the original filename in the DB row (for the UI list); the on-disk
// name is a uuid to avoid collisions and path-traversal risks.
export async function persistLmsAttachment(
  file: Express.Multer.File,
): Promise<{
  urlPath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const filename = `${randomUUID()}.pdf`;
  await fs.promises.writeFile(
    path.join(LMS_ATTACHMENT_DIR, filename),
    file.buffer,
  );
  // Multer decodes filename as latin1 — re-decode as utf-8 to preserve
  // Cyrillic / non-ASCII names in the DB display.
  const original = Buffer.from(file.originalname, "latin1").toString("utf8");
  return {
    urlPath: lmsAttachmentUrlFor(filename),
    fileName: original,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

// Best-effort delete of a stored attachment file. Accepts the urlPath stored
// on the row (e.g. "/lms-attachments/abc.pdf") and ignores missing files.
export async function deleteLmsAttachmentFile(urlPath: string): Promise<void> {
  const filename = path.basename(urlPath);
  if (!filename) return;
  await fs.promises.rm(path.join(LMS_ATTACHMENT_DIR, filename), {
    force: true,
  });
}
