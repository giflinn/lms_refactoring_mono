import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import http from "node:http";
import { config } from "./config";
import { attachSocketServer } from "./services/socketServer";
import { startPushDispatcher } from "./services/pushNotifications";
import { startNotificationDispatcher } from "./services/notificationDispatcher";
import { authRouter } from "./routes/auth";
import { passwordResetRouter } from "./routes/passwordReset";
import { managersRouter } from "./routes/managers";
import { clientsRouter } from "./routes/clients";
import { productCategoriesRouter } from "./routes/productCategories";
import { productsRouter } from "./routes/products";
import { clientCatalogRouter } from "./routes/clientCatalog";
import { favoritesRouter } from "./routes/favorites";
import { slotTypesRouter } from "./routes/slotTypes";
import { coachSlotsRouter } from "./routes/coachSlots";
import { chatRouter } from "./routes/chat";
import { supportRouter } from "./routes/support";
import { settingsRouter } from "./routes/settings";
import { fcmTokensRouter } from "./routes/fcmTokens";
import { notificationsRouter } from "./routes/notifications";
import { AVATAR_DIR } from "./services/avatarUpload";
import { PRODUCT_IMAGE_DIR } from "./services/productImageUpload";
import { CHAT_DIR } from "./services/chatAttachments";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/avatars", express.static(AVATAR_DIR));
app.use("/product-images", express.static(PRODUCT_IMAGE_DIR));
app.use("/chat-files", express.static(CHAT_DIR));

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
app.use(clientCatalogRouter);
app.use(favoritesRouter);
app.use(slotTypesRouter);
app.use(coachSlotsRouter);
app.use(chatRouter);
app.use(supportRouter);
app.use(settingsRouter);
app.use(fcmTokensRouter);
app.use(notificationsRouter);

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

const httpServer = http.createServer(app);
attachSocketServer(httpServer);
startPushDispatcher();
startNotificationDispatcher();

httpServer.listen(config.port, () => {
  console.log(`[lms-backend] listening on http://localhost:${config.port}`);
});
