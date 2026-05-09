import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import http from "node:http";
import { config } from "./config";
import { attachSocketServer } from "./services/socketServer";
import { startPushDispatcher } from "./services/pushNotifications";
import { startNotificationDispatcher } from "./services/notificationDispatcher";
import { startOrderLifecycleCron } from "./services/orderLifecycleCron";
import { startUnverifiedUsersCleanupCron } from "./services/unverifiedUsersCleanupCron";
import { authRouter } from "./routes/auth";
import { passwordResetRouter } from "./routes/passwordReset";
import { emailVerificationRouter } from "./routes/emailVerification";
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
import { ordersRouter } from "./routes/orders";
import { cancellationsRouter } from "./routes/cancellations";
import { feedbackRouter } from "./routes/feedback";
import { legalRouter } from "./routes/legal";
import { kaspiRouter } from "./routes/kaspi";
import { reviewsRouter } from "./routes/reviews";
import { telegramAdminRouter } from "./routes/telegramAdmin";
import { telegramWebhookRouter } from "./routes/telegramWebhook";
import { meTelegramRouter } from "./routes/meTelegram";
import { meOrdersRouter } from "./routes/meOrders";
import { lmsRouter } from "./routes/lms";
import { meLmsRouter } from "./routes/meLms";
import { dashboardRouter } from "./routes/dashboard";
import { reportsRouter } from "./routes/reports";
import { initBot } from "./services/telegram/bot";
import {
  startTelegramExpiryCron,
  startTelegramTokenCleanupCron,
} from "./services/telegram/cron";
import { AVATAR_DIR } from "./services/avatarUpload";
import { PRODUCT_IMAGE_DIR } from "./services/productImageUpload";
import { PRODUCT_VIDEO_DIR } from "./services/productVideoUpload";
import { CHAT_DIR } from "./services/chatAttachments";
import { LMS_COVER_DIR, LMS_MEDIA_DIR } from "./services/lmsUpload";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/avatars", express.static(AVATAR_DIR));
app.use("/product-images", express.static(PRODUCT_IMAGE_DIR));
app.use("/product-videos", express.static(PRODUCT_VIDEO_DIR));
app.use("/chat-files", express.static(CHAT_DIR));
app.use("/lms-covers", express.static(LMS_COVER_DIR));
app.use("/lms-media", express.static(LMS_MEDIA_DIR));

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "lms-backend" });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(authRouter);
app.use(passwordResetRouter);
app.use(emailVerificationRouter);
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
app.use(ordersRouter);
app.use(cancellationsRouter);
app.use(feedbackRouter);
app.use(legalRouter);
app.use(kaspiRouter);
app.use(reviewsRouter);
app.use(telegramAdminRouter);
app.use(telegramWebhookRouter);
app.use(meTelegramRouter);
app.use(meOrdersRouter);
app.use(lmsRouter);
app.use(meLmsRouter);
app.use(dashboardRouter);
app.use(reportsRouter);

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
startOrderLifecycleCron();
startUnverifiedUsersCleanupCron();
// Bot init reads the token from app_settings; no-op if it's empty. Errors
// are logged inside initBot — never crash the boot on a missing/invalid bot.
initBot().catch((err) => {
  console.error("[telegram] bot init crashed:", err);
});
startTelegramExpiryCron();
startTelegramTokenCleanupCron();

httpServer.listen(config.port, () => {
  console.log(`[lms-backend] listening on http://localhost:${config.port}`);
});
