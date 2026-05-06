import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import multer from "multer";

// Optional cover videos for products. Same disk-storage / express.static
// pattern as productImageUpload, but the filename uses a random uuid so
// changing the video doesn't have to clean up the previous extension.
//
// 50 MB ceiling matches the LMS media upload — short loops / promo clips, not
// long-form. Anything bigger should be hosted externally and pasted as a
// YouTube link instead (cheaper for the t2.micro disk and gets us a free
// CDN).

export const PRODUCT_VIDEO_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "product-videos",
);

if (!fs.existsSync(PRODUCT_VIDEO_DIR)) {
  fs.mkdirSync(PRODUCT_VIDEO_DIR, { recursive: true });
}

const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const COVER_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// Combined multer middleware that consumes ONE multipart stream containing
// both the product cover image (`cover` field) and the optional cover video
// (`videoFile` field). Multer can only parse the body once, so the products
// POST/PATCH route uses this rather than chaining two single() middlewares.
//
// fileSize is set to the larger of the two limits (50MB for video). The
// fileFilter switches per fieldname to keep MIME enforcement tight; the size
// cap for cover images is left at the route layer if we ever care to police
// it tighter (we currently don't — anything over 5MB cover is unusual but
// not dangerous).
export const productMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "cover") {
      if (!COVER_IMAGE_MIMES.has(file.mimetype)) {
        return cb(new Error("unsupported_mime_type"));
      }
    } else if (file.fieldname === "videoFile") {
      if (!VIDEO_MIMES.has(file.mimetype)) {
        return cb(new Error("unsupported_mime_type"));
      }
    } else {
      return cb(new Error("unexpected_field"));
    }
    cb(null, true);
  },
});

export function productVideoUrlFor(filename: string): string {
  return `/product-videos/${filename}`;
}

function extForVideoMime(mime: string): string {
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "mp4";
}

// Persists a fresh upload under a uuid-based filename. The previous file (if
// any) is cleaned up by deleteProductVideoFile when the route swaps URLs.
export async function persistProductVideo(
  file: Express.Multer.File,
): Promise<string> {
  const ext = extForVideoMime(file.mimetype);
  const filename = `${randomUUID()}.${ext}`;
  await fs.promises.writeFile(
    path.join(PRODUCT_VIDEO_DIR, filename),
    file.buffer,
  );
  return productVideoUrlFor(filename);
}

// Removes a single product-video file by its public URL. No-op when the URL
// points outside our uploads (YouTube etc.) or when the file is already gone.
export async function deleteProductVideoFile(
  url: string | null | undefined,
): Promise<void> {
  if (!url || !url.startsWith("/product-videos/")) return;
  const filename = url.slice("/product-videos/".length);
  // Defensive: refuse anything that tries to climb out of the directory.
  if (filename.includes("/") || filename.includes("..")) return;
  const p = path.join(PRODUCT_VIDEO_DIR, filename);
  await fs.promises.rm(p, { force: true });
}

// YouTube URL → 11-char video id. Accepts watch?v=, youtu.be/, and
// /shorts/. Returns null when the URL doesn't match — callers reject the
// request with `invalid_video_url`.
const YT_RE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/i;
export function parseYoutubeId(url: string): string | null {
  const m = url.trim().match(YT_RE);
  return m ? m[1] : null;
}

export function isUploadedVideoUrl(url: string): boolean {
  return url.startsWith("/product-videos/");
}
