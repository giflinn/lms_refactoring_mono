// Daily sweep that deletes Firebase users (and the matching DB row) who
// signed up via password but never completed email verification within 7
// days. Without this they pile up forever — Firebase blocks re-registration
// with the same email and clutters the auth list. Same in-process, single-
// host cron model as orderLifecycleCron / notificationDispatcher.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { firebaseAuth } from "../firebase";

const TICK_MS = 24 * 60 * 60 * 1000; // 1 day
const ORPHAN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function startUnverifiedUsersCleanupCron(): void {
  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}

async function tick(): Promise<void> {
  try {
    await sweep();
  } catch (err) {
    console.error("[unverified-cron] sweep failed:", err);
  }
}

async function sweep(): Promise<void> {
  const cutoff = Date.now() - ORPHAN_AFTER_MS;
  let pageToken: string | undefined;
  let removed = 0;

  do {
    const page = await firebaseAuth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.emailVerified) continue;
      // Google sign-in users are emailVerified=true by Firebase, so an
      // unverified user with only social providers shouldn't exist in our
      // flow — defensive skip rather than risk wiping a future auth path.
      const hasPassword = u.providerData.some(
        (p) => p.providerId === "password",
      );
      if (!hasPassword) continue;
      const created = u.metadata.creationTime
        ? Date.parse(u.metadata.creationTime)
        : 0;
      if (!created || created >= cutoff) continue;

      try {
        // DB first: if Firebase delete fails afterwards, the next sweep
        // retries it. The reverse order would leave an orphan DB row that
        // can no longer be referenced via firebase_uid (RESTRICT FKs would
        // refuse re-creation under the same email).
        await db.delete(users).where(eq(users.firebaseUid, u.uid));
        await firebaseAuth.deleteUser(u.uid);
        removed++;
      } catch (err) {
        console.error("[unverified-cron] delete failed for", u.uid, err);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  if (removed > 0) {
    console.log(
      `[unverified-cron] removed ${removed} unverified users older than 7 days`,
    );
  }
}
