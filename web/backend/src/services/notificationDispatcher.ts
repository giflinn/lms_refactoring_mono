// Polls the notifications table every minute, fires anything past
// next_fire_at, records per-recipient delivery rows (for the future mobile
// inbox) and pushes via FCM. Mirrors the lightweight, in-process pattern of
// startPushDispatcher() — single pm2 host, no queue or external scheduler.

import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import {
  notifications,
  notificationDeliveries,
  userFcmTokens,
  users,
} from "../db/schema";
import { firebaseMessaging } from "../firebase";
import {
  computeNextFireAt,
  type RecurrenceUnit,
} from "./notificationRecurrence";

const TICK_MS = 60_000;

export function startNotificationDispatcher(): void {
  // Initial run so a row that comes due during boot doesn't wait a minute.
  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}

async function tick(): Promise<void> {
  try {
    const due = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.status, "active"),
          isNotNull(notifications.nextFireAt),
          lte(notifications.nextFireAt, new Date()),
        ),
      );
    for (const n of due) {
      try {
        await fire(n);
      } catch (err) {
        console.error("[notifications] fire failed for", n.id, err);
      }
    }
  } catch (err) {
    console.error("[notifications] tick failed:", err);
  }
}

async function fire(n: typeof notifications.$inferSelect): Promise<void> {
  const firedAt = n.nextFireAt!;

  // Decide the new cursor BEFORE fan-out so a crash during push delivery
  // doesn't cause the same row to fire twice on the next tick.
  let newNextFireAt: Date | null = null;
  let newStatus: "active" | "completed" = "completed";
  if (n.recurrenceUnit) {
    const next = computeNextFireAt(
      {
        startsAt: n.startsAt!,
        unit: n.recurrenceUnit as RecurrenceUnit,
        interval: n.recurrenceInterval!,
        byweekday: n.recurrenceByweekday,
        endsAt: n.endsAt,
      },
      firedAt,
      false,
    );
    if (next) {
      newNextFireAt = next;
      newStatus = "active";
    }
  }

  await db
    .update(notifications)
    .set({
      nextFireAt: newNextFireAt,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, n.id));

  const recipientConditions = [
    eq(users.role, "client"),
    isNull(users.deactivatedAt),
  ];
  if (n.category) {
    recipientConditions.push(eq(users.clientCategory, n.category));
  }
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...recipientConditions));

  if (recipients.length === 0) return;

  for (const r of recipients) {
    // Inbox row first — it's the durable record. FCM is best-effort.
    // title/body snapshotted so a later edit/delete of the parent
    // notifications row doesn't mutate what the user already received.
    await db.insert(notificationDeliveries).values({
      notificationId: n.id,
      userId: r.id,
      title: n.title,
      body: n.body,
      sentAt: firedAt,
    });

    const tokens = await db
      .select({ token: userFcmTokens.token })
      .from(userFcmTokens)
      .where(eq(userFcmTokens.userId, r.id));

    for (const t of tokens) {
      try {
        await firebaseMessaging.send({
          token: t.token,
          notification: { title: n.title, body: n.body },
          data: {
            type: "scheduled_notification",
            notificationId: n.id,
          },
          apns: { payload: { aps: { sound: "default" } } },
          android: {
            priority: "high",
            notification: { channelId: "default" },
          },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await db
            .delete(userFcmTokens)
            .where(eq(userFcmTokens.token, t.token));
        } else {
          console.error(
            "[notifications] send failed for token:",
            code,
            err,
          );
        }
      }
    }
  }
}
