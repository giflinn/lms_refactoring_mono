import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  orders,
  coachBookings,
  orderCancellations,
  productReviews,
  chatMessages,
} from "../src/db/schema";
import { firebaseAuth } from "../src/firebase";

// One-off ops script — remove the amoCRM bulk-import client cohort at the
// customer's request (precedent: d7ef14f, one-off settle script).
//
// scripts/import-clients.ts (run 2026-05-29) created ~3982 dormant `client`
// rows + Firebase accounts from an amoCRM export. The customer now wants them
// gone. This deletes BOTH the Firebase Auth accounts and the users rows
// (notification_deliveries cascade). Managers/admins and organically
// registered clients are untouched.
//
// Cohort predicate — triple-redundant; on prod all three conditions select the
// exact same 3982 rows (verified before writing this):
//   role='client'
//   AND terms_accepted_at IS NULL        -- the import never set it; real signups do
//   AND email ~ '^[0-9]+@mail.ru$'       -- phone-derived amoCRM email
//   AND created_at::date = '2026-05-29'  -- the import batch day
//
// Safety:
//   * dry-run by default; --apply is required to mutate anything.
//   * aborts if any cohort member has order/booking/cancellation/review/chat
//     activity (each is an ON DELETE RESTRICT FK that would also block the
//     delete) — so a client who actually used the app is never touched.
//   * writes a JSON backup of the deleted set (server-side) before deleting.
//   * --skip-firebase deletes the DB rows only, leaving the Firebase accounts.

const cohortWhere = and(
  eq(users.role, "client"),
  isNull(users.termsAcceptedAt),
  sql`${users.email} ~ '^[0-9]+@mail\\.ru$'`,
  sql`${users.createdAt}::date = '2026-05-29'`,
);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "skip-firebase": { type: "boolean", default: false },
    },
  });
  const apply = values.apply === true;
  const skipFirebase = values["skip-firebase"] === true;

  const cohort = await db
    .select({
      id: users.id,
      firebaseUid: users.firebaseUid,
      email: users.email,
      phone: users.phone,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(cohortWhere);

  console.log(`Cohort size: ${cohort.length}`);
  if (cohort.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }
  const ids = cohort.map((c) => c.id);

  // Activity audit — each relation below is an ON DELETE RESTRICT FK to users,
  // so a non-zero count means a cohort member actually used the app and must
  // not be deleted. (These RESTRICTs would also abort the DB delete anyway.)
  const cnt = async (
    rows: Promise<{ n: number }[]>,
  ): Promise<number> => (await rows)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  const activity = {
    orders: await cnt(db.select({ n }).from(orders).where(inArray(orders.clientId, ids))),
    coach_bookings: await cnt(db.select({ n }).from(coachBookings).where(inArray(coachBookings.clientId, ids))),
    order_cancellations: await cnt(db.select({ n }).from(orderCancellations).where(inArray(orderCancellations.clientId, ids))),
    product_reviews: await cnt(db.select({ n }).from(productReviews).where(inArray(productReviews.clientId, ids))),
    chat_messages: await cnt(db.select({ n }).from(chatMessages).where(inArray(chatMessages.senderId, ids))),
  };
  console.log("Activity audit (must all be 0):", JSON.stringify(activity));
  const totalActivity = Object.values(activity).reduce((a, b) => a + b, 0);
  if (totalActivity > 0) {
    console.error("✗ Cohort has activity — refusing to delete. Investigate the counts above.");
    process.exit(1);
  }

  if (!apply) {
    console.log("\n[DRY RUN] No changes made. Re-run with --apply to delete.");
    console.log(
      `Would delete ${cohort.length} users rows` +
        (skipFirebase
          ? " (Firebase accounts SKIPPED: --skip-firebase)."
          : " + their Firebase accounts."),
    );
    console.log("Sample (first 5):");
    for (const c of cohort.slice(0, 5)) {
      console.log(`  ${c.email}  ${c.firstName} ${c.lastName}  uid=${c.firebaseUid}`);
    }
    process.exit(0);
  }

  // --- APPLY (irreversible) ---
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `imported-clients-deleted-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify(cohort, null, 2));
  console.log(`Backup written: ${backupPath} (${cohort.length} rows)`);

  // 1. DB rows first. The RESTRICT FKs make this fail-safe: if any member had
  //    activity the statement aborts and Firebase is left untouched.
  const deleted = await db
    .delete(users)
    .where(inArray(users.id, ids))
    .returning({ firebaseUid: users.firebaseUid });
  console.log(`DB: deleted ${deleted.length} users rows (notification_deliveries cascaded).`);

  // 2. The matching Firebase accounts (deleteUsers takes ≤1000 uids per call;
  //    it counts already-absent uids as successes, so re-running is safe).
  if (skipFirebase) {
    console.log("Firebase: skipped (--skip-firebase). Orphan accounts remain.");
  } else {
    const uids = deleted.map((d) => d.firebaseUid);
    let ok = 0;
    let fail = 0;
    const errSamples: string[] = [];
    for (const batch of chunk(uids, 1000)) {
      const r = await firebaseAuth.deleteUsers(batch);
      ok += r.successCount;
      fail += r.failureCount;
      for (const e of r.errors) {
        if (errSamples.length < 10) errSamples.push(`idx ${e.index}: ${e.error.message}`);
      }
    }
    console.log(`Firebase: deleted ${ok}, failed ${fail}.`);
    if (errSamples.length) console.log("First errors:\n" + errSamples.join("\n"));
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
