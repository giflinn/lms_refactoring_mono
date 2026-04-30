import path from "node:path";
import fs from "node:fs";
import multer from "multer";

export const AVATAR_DIR = path.resolve(process.cwd(), "uploads", "avatars");

if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

// Filename = <firebaseUid>.<ext>. We rely on the requireAuth middleware having
// populated req.uid by the time multer runs.
export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const uid = req.uid;
      if (!uid) return cb(new Error("uid_missing_at_upload"), "");
      cb(null, `${uid}.${extForMime(file.mimetype)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

export function avatarUrlFor(filename: string): string {
  return `/avatars/${filename}`;
}
