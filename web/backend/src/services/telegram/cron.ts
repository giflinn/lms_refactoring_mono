// Background sweepers for the Telegram subsystem.
//
//   startTelegramExpiryCron
//     Hourly. Kicks any membership whose expires_at has passed (Telegram
//     subscription products with activeDurationDays). Order-level
//     completion already revokes via changeOrderFulfillmentStatus, so this
//     mainly catches mixed bundles (perpetual + timed) where the order
//     stays active but a single Telegram item ran out.
//
//   startTelegramTokenCleanupCron
//     Daily. Drops link tokens whose 15-min window expired more than a day
//     ago. Old tokens carry no audit value and never come back.
//
// Both are in-process setInterval timers, kept simple to match the rest of
// the project (chat dispatcher, notifications dispatcher). Single-host pm2
// — no need for an external scheduler.

import { and, inArray, lte } from "drizzle-orm";
import { db } from "../../db";
import { telegramMemberships } from "../../db/schema";
import { revokeMembership } from "./grants";
import { purgeStaleLinkTokens } from "./linkTokens";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function startTelegramExpiryCron(): void {
  const tick = () => {
    expireMemberships().catch((err) =>
      console.error("[telegram] expiry sweep failed:", err),
    );
  };
  // Run once at boot to catch anything that should have expired while the
  // process was down, then every hour afterwards.
  setTimeout(tick, 30 * 1000); // small delay so DB has settled
  setInterval(tick, HOUR_MS);
}

export function startTelegramTokenCleanupCron(): void {
  const tick = () => {
    purgeStaleLinkTokens()
      .then((n) => {
        if (n > 0) console.log(`[telegram] purged ${n} stale link tokens`);
      })
      .catch((err) =>
        console.error("[telegram] token cleanup failed:", err),
      );
  };
  setTimeout(tick, 60 * 1000);
  setInterval(tick, DAY_MS);
}

async function expireMemberships(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(telegramMemberships)
    .where(
      and(
        lte(telegramMemberships.expiresAt, now),
        inArray(telegramMemberships.status, ["pending", "joined"]),
      ),
    );
  if (expired.length === 0) return;
  for (const m of expired) {
    await revokeMembership(m).catch((err) =>
      console.error(
        `[telegram] failed to expire membership ${m.id}:`,
        err,
      ),
    );
  }
  console.log(`[telegram] expired ${expired.length} memberships`);
}
