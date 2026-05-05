// Generic per-user FCM dispatcher. Use for any feature that needs to push to
// a single user (orders status, future password-changed alerts, etc.). Chat
// has its own dispatcher in pushNotifications.ts with presence and badge
// logic — don't fold them together.
//
// Every send also writes a notification_deliveries row so the message lands
// in the user's in-app inbox (Кабинет → Уведомления). FCM is best-effort;
// the inbox row is the durable record and is written first.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { notificationDeliveries, userFcmTokens } from "../db/schema";
import { firebaseMessaging } from "../firebase";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  // Android notification channel id. Defaults to "default".
  channelId?: string;
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  // Inbox row first — durable, doesn't depend on the user having an FCM
  // token. notification_id is NULL because system pushes don't have a
  // parent scheduled-notifications row.
  await db.insert(notificationDeliveries).values({
    userId,
    title: payload.title,
    body: payload.body,
  });

  const tokens = await db
    .select({ token: userFcmTokens.token })
    .from(userFcmTokens)
    .where(eq(userFcmTokens.userId, userId));
  if (tokens.length === 0) return;

  const channelId = payload.channelId ?? "default";
  for (const t of tokens) {
    try {
      await firebaseMessaging.send({
        token: t.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        apns: { payload: { aps: { sound: "default" } } },
        android: { priority: "high", notification: { channelId } },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        await db.delete(userFcmTokens).where(eq(userFcmTokens.token, t.token));
      } else {
        console.error("[push] send failed for token:", code, err);
      }
    }
  }
}
