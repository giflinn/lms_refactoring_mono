import path from "node:path";
import fs from "node:fs";
import multer from "multer";

export const AVATAR_DIR = path.resolve(process.cwd(), "uploads", "avatars");

if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function extForMime(mime: string): string {
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

// Variant for uploads where the target user isn't the request actor (admin
// uploading a manager's photo). The file is held in memory; the route handler
// names and persists it after looking up the target.
export const managerAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

// Persists an in-memory upload to disk under <firebaseUid>.<ext>. Older avatars
// for the same uid (different extension) are removed so we don't leak stale
// files from previous uploads.
export async function persistManagerAvatar(
  firebaseUid: string,
  file: Express.Multer.File,
): Promise<string> {
  const ext = extForMime(file.mimetype);
  for (const oldExt of ["jpg", "png", "webp"]) {
    if (oldExt === ext) continue;
    const oldPath = path.join(AVATAR_DIR, `${firebaseUid}.${oldExt}`);
    await fs.promises.rm(oldPath, { force: true });
  }
  const filename = `${firebaseUid}.${ext}`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, filename), file.buffer);
  return avatarUrlFor(filename);
}
