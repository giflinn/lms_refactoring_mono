import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { firebaseAuth } from "../src/firebase";

// Bulk-imports amoCRM contacts as `client` users, linked to their responsible
// manager. Input is a JSON array produced offline from the CSV export — each
// record is already normalized + deduped:
//   { amoId, email, password, phone, firstName, lastName, managerEmail }
// For each record: create (or reuse) a Firebase user, then insert a users row.
//
// Idempotent / resumable: an existing Firebase email is reused (password is NOT
// reset, so a real user is never clobbered); an existing users row (same
// firebase_uid) is left untouched (onConflictDoNothing). Safe to re-run after
// a partial failure.

type Record = {
  amoId: string;
  email: string;
  password: string;
  phone: string;
  firstName: string;
  lastName: string;
  managerEmail: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fbCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; errorInfo?: { code?: string } };
    return e.code ?? e.errorInfo?.code;
  }
  return undefined;
}

// Retry Firebase calls on transient rate-limit / quota errors with backoff.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 500;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = fbCode(err);
      if (
        code === "auth/too-many-requests" ||
        code === "auth/quota-exceeded" ||
        code === "auth/internal-error"
      ) {
        await sleep(delay);
        delay = Math.min(delay * 2, 16000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Firebase retry budget exhausted");
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      concurrency: { type: "string" },
      limit: { type: "string" },
    },
  });
  if (!values.file) {
    console.error("Usage: npm run import:clients -- --file=<clients.json> [--concurrency=10] [--limit=N]");
    process.exit(1);
  }
  const concurrency = Math.max(1, parseInt(values.concurrency ?? "10", 10));

  let records: Record[] = JSON.parse(readFileSync(values.file, "utf-8"));
  if (values.limit) {
    records = records.slice(0, Math.max(0, parseInt(values.limit, 10)));
    console.log(`(--limit) processing first ${records.length} records only`);
  }
  console.log(`Loaded ${records.length} records from ${values.file}`);

  // Resolve responsible-manager emails -> users.id.
  const managerEmails = [...new Set(records.map((r) => r.managerEmail))];
  const managerRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, managerEmails));
  const managerIdByEmail = new Map(managerRows.map((m) => [m.email, m.id]));
  const missing = managerEmails.filter((e) => !managerIdByEmail.has(e));
  if (missing.length > 0) {
    console.error(`✗ Managers not found in DB (seed them first): ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`Linked to ${managerIdByEmail.size} managers.`);

  let fbCreated = 0;
  let fbReused = 0;
  let dbInserted = 0;
  let dbSkipped = 0;
  const errors: Array<{ amoId: string; email: string; error: string }> = [];
  let processed = 0;

  await runPool(records, concurrency, async (rec) => {
    try {
      let uid: string;
      try {
        const created = await withRetry(() =>
          firebaseAuth.createUser({
            email: rec.email,
            password: rec.password,
            emailVerified: true,
          }),
        );
        uid = created.uid;
        fbCreated++;
      } catch (err) {
        if (fbCode(err) === "auth/email-already-exists") {
          const existing = await withRetry(() => firebaseAuth.getUserByEmail(rec.email));
          uid = existing.uid;
          fbReused++;
        } else {
          throw err;
        }
      }

      const res = await db
        .insert(users)
        .values({
          firebaseUid: uid,
          email: rec.email,
          role: "client",
          firstName: rec.firstName,
          lastName: rec.lastName,
          phone: rec.phone,
          managerId: managerIdByEmail.get(rec.managerEmail)!,
        })
        .onConflictDoNothing({ target: users.firebaseUid })
        .returning({ id: users.id });
      if (res.length > 0) dbInserted++;
      else dbSkipped++;
    } catch (err) {
      errors.push({
        amoId: rec.amoId,
        email: rec.email,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      processed++;
      if (processed % 200 === 0) {
        console.log(
          `… ${processed}/${records.length}  (fb created ${fbCreated}, reused ${fbReused}, db inserted ${dbInserted}, skipped ${dbSkipped}, errors ${errors.length})`,
        );
      }
    }
  });

  console.log("\n──────────────────────────────────────────────");
  console.log("Import summary");
  console.log("──────────────────────────────────────────────");
  console.log(`  records:       ${records.length}`);
  console.log(`  firebase new:  ${fbCreated}`);
  console.log(`  firebase reuse:${fbReused}`);
  console.log(`  db inserted:   ${dbInserted}`);
  console.log(`  db skipped:    ${dbSkipped}`);
  console.log(`  errors:        ${errors.length}`);
  if (errors.length > 0) {
    console.log("\nFirst 20 errors:");
    for (const e of errors.slice(0, 20)) {
      console.log(`  amoId=${e.amoId} ${e.email}: ${e.error}`);
    }
  }
  console.log("──────────────────────────────────────────────");
  process.exit(errors.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
