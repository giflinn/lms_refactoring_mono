import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { passwordResetRouter } from "./routes/passwordReset";
import { managersRouter } from "./routes/managers";
import { clientsRouter } from "./routes/clients";
import { productCategoriesRouter } from "./routes/productCategories";
import { productsRouter } from "./routes/products";
import { AVATAR_DIR } from "./services/avatarUpload";
import { PRODUCT_IMAGE_DIR } from "./services/productImageUpload";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/avatars", express.static(AVATAR_DIR));
app.use("/product-images", express.static(PRODUCT_IMAGE_DIR));

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "lms-backend" });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(authRouter);
app.use(passwordResetRouter);
app.use(managersRouter);
app.use(clientsRouter);
app.use(productCategoriesRouter);
app.use(productsRouter);

// Global error handler — must be last in the middleware chain. Express
// identifies error handlers by the 4-argument signature, so all four params
// are required even when unused. Routes call next(err) and end up here.
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (res.headersSent) return;

    // Multer surfaces client-side upload errors (file too big, bad mime) as
    // exceptions; translate them to 400 instead of 500.
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.code });
      return;
    }
    if (err instanceof Error && err.message === "unsupported_mime_type") {
      res.status(400).json({ error: "unsupported_mime_type" });
      return;
    }

    console.error("[lms-backend] unhandled error:", err);
    res.status(500).json({ error: "internal_error" });
  },
);

app.listen(config.port, () => {
  console.log(`[lms-backend] listening on http://localhost:${config.port}`);
});
