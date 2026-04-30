import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
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

  if (!values.email || !values.password) {
    console.error(
      "Usage: npm run seed:admin -- --email=<email> --password=<password>",
    );
    process.exit(1);
  }

  const { email, password } = values;

  let firebaseUid: string;
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    firebaseUid = existing.uid;
    console.log(`✓ Firebase user already exists (uid=${firebaseUid})`);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "auth/user-not-found"
    ) {
      const created = await firebaseAuth.createUser({ email, password });
      firebaseUid = created.uid;
      console.log(`✓ Firebase user created (uid=${firebaseUid})`);
    } else {
      throw err;
    }
  }

  const existingDb = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  if (existingDb.length > 0) {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.firebaseUid, firebaseUid));
    console.log(
      `✓ DB user updated: id=${existingDb[0].id} role=admin`,
    );
  } else {
    const [created] = await db
      .insert(users)
      .values({ firebaseUid, email, role: "admin" })
      .returning();
    console.log(`✓ DB user created: id=${created.id} role=admin`);
  }

  console.log(`\nAdmin ready: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
