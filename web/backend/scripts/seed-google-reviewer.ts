import { parseArgs } from "node:util";
import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { firebaseAuth } from "../src/firebase";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
    },
  });

  if (!values.email) {
    console.error(
      "Usage: npm run seed:reviewer -- --email=<email> [--password=<password>]",
    );
    process.exit(1);
  }

  const email = values.email;
  const password =
    values.password ??
    crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);

  let firebaseUid: string;
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    firebaseUid = existing.uid;
    await firebaseAuth.updateUser(firebaseUid, {
      password,
      emailVerified: true,
      disabled: false,
    });
    console.log(`✓ Firebase user existed; password reset (uid=${firebaseUid})`);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "auth/user-not-found"
    ) {
      const created = await firebaseAuth.createUser({
        email,
        password,
        emailVerified: true,
      });
      firebaseUid = created.uid;
      console.log(`✓ Firebase user created (uid=${firebaseUid})`);
    } else {
      throw err;
    }
  }

  const [oldestStaff] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.role, ["admin", "senior_manager", "manager"]),
        isNull(users.deactivatedAt),
      ),
    )
    .orderBy(asc(users.createdAt))
    .limit(1);

  const managerId = oldestStaff?.id ?? null;

  const existingDb = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  if (existingDb.length > 0) {
    await db
      .update(users)
      .set({
        role: "client",
        firstName: "Google",
        lastName: "Review",
        phone: "+77770000000",
        managerId,
        selfDeletedAt: null,
        deactivatedAt: null,
        termsAcceptedAt: new Date(),
      })
      .where(eq(users.firebaseUid, firebaseUid));
    console.log(`✓ DB user updated: id=${existingDb[0].id} role=client`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        firebaseUid,
        email,
        role: "client",
        firstName: "Google",
        lastName: "Review",
        phone: "+77770000000",
        managerId,
        termsAcceptedAt: new Date(),
      })
      .returning();
    console.log(`✓ DB user created: id=${created.id} role=client`);
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("Google Play Reviewer credentials");
  console.log("──────────────────────────────────────────────");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("──────────────────────────────────────────────");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
