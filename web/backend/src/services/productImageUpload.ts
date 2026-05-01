import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { extForMime } from "./avatarUpload";

export const PRODUCT_IMAGE_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "products",
);

if (!fs.existsSync(PRODUCT_IMAGE_DIR)) {
  fs.mkdirSync(PRODUCT_IMAGE_DIR, { recursive: true });
}

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Memory storage — the route handler decides the filename only after the
// product row exists (we need its id), so we hold the file in memory and
// persist via persistProductImage.
export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error("unsupported_mime_type"));
    }
    cb(null, true);
  },
});

export function productImageUrlFor(filename: string): string {
  return `/product-images/${filename}`;
}

// Saves an in-memory upload to disk under <productId>.<ext>; removes any
// stale file with a different extension for the same id so old covers don't
// linger.
export async function persistProductImage(
  productId: string,
  file: Express.Multer.File,
): Promise<string> {
  const ext = extForMime(file.mimetype);
  for (const oldExt of ["jpg", "png", "webp"]) {
    if (oldExt === ext) continue;
    const oldPath = path.join(PRODUCT_IMAGE_DIR, `${productId}.${oldExt}`);
    await fs.promises.rm(oldPath, { force: true });
  }
  const filename = `${productId}.${ext}`;
  await fs.promises.writeFile(
    path.join(PRODUCT_IMAGE_DIR, filename),
    file.buffer,
  );
  return productImageUrlFor(filename);
}

// Removes any cover file for the product (used when switching to coverKind
// 'preset', or when deleting the product).
export async function deleteProductImage(productId: string): Promise<void> {
  for (const ext of ["jpg", "png", "webp"]) {
    const p = path.join(PRODUCT_IMAGE_DIR, `${productId}.${ext}`);
    await fs.promises.rm(p, { force: true });
  }
}
