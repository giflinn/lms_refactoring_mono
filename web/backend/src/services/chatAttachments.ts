// Multer config + persistence helpers for chat attachments. Files are held in
// memory during the request and persisted to disk only after the message row
// is created (we need the thread id and a fresh uuid before we know the final
// path).
//
// Layout on disk: web/backend/uploads/chat/<thread_id>/<uuid>.<ext>
// Served via: app.use('/chat-files', express.static(CHAT_DIR)) in index.ts
//
// Limits — images up to 10 MB, PDFs up to 20 MB. Multer enforces a single
// global byte limit, so we set the higher one and validate the per-mime
// ceiling in code at persistence time.

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";

export const CHAT_DIR = path.resolve(process.cwd(), "uploads", "chat");

if (!fs.existsSync(CHAT_DIR)) {
  fs.mkdirSync(CHAT_DIR, { recursive: true });
}

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const PDF_MIME = "application/pdf";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

export const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_BYTES, // hard ceiling; per-mime ceiling re-checked below
    files: MAX_FILES_PER_MESSAGE,
  },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype) || file.mimetype === PDF_MIME) {
      return cb(null, true);
    }
    cb(new Error("unsupported_mime_type"));
  },
});

export type StoredAttachment = {
  url: string;
  mime: string;
  name: string;
  size: number;
};

// Validates per-mime size ceilings, writes the buffer to disk, returns the
// URL-safe descriptor we stash in chat_messages.attachments (JSON-encoded).
export async function persistAttachment(
  threadId: string,
  file: Express.Multer.File,
): Promise<StoredAttachment> {
  if (IMAGE_MIMES.has(file.mimetype) && file.size > MAX_IMAGE_BYTES) {
    throw new Error("image_too_large");
  }
  if (file.mimetype === PDF_MIME && file.size > MAX_PDF_BYTES) {
    throw new Error("pdf_too_large");
  }
  const dir = path.join(CHAT_DIR, threadId);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  const id = crypto.randomUUID();
  const ext = extForMime(file.mimetype);
  const filename = `${id}.${ext}`;
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);
  return {
    url: `/chat-files/${threadId}/${filename}`,
    mime: file.mimetype,
    name: file.originalname,
    size: file.size,
  };
}

export function encodeAttachments(items: StoredAttachment[]): string | null {
  if (items.length === 0) return null;
  return JSON.stringify(items);
}

export function decodeAttachments(value: string | null): StoredAttachment[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as StoredAttachment[];
    return [];
  } catch {
    return [];
  }
}
