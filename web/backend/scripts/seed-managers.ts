import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { firebaseAuth } from "../src/firebase";
import { generateUniqueManagerCode } from "../src/services/managerCode";

// One-shot seed for the sales staff imported from the amoCRM list.
// Creates a Firebase user (random password) + a `users` row per person, with a
// unique manager_code so clients can link to them during mobile registration.
// Idempotent: re-running resets the password and refreshes name/role/phone for
// anyone who already exists (matched by Firebase email).

type SeedManager = {
  email: string;
  firstName: string;
  lastName: string;
  role: "manager" | "senior_manager";
};

// Last name falls back to a duplicate of the first name where CRM has none.
const MANAGERS: SeedManager[] = [
  { email: "860924450718@mail.ru", firstName: "Жанна", lastName: "Слямова", role: "senior_manager" },
  { email: "ajnagulaktanova2@gmail.com", firstName: "Айнагуль", lastName: "Айнагуль", role: "manager" },
  { email: "zhs.operator5@gmail.com", firstName: "Жанна", lastName: "Жанна", role: "manager" },
  { email: "zhs.operator6@gmail.com", firstName: "Бибинур", lastName: "Бибинур", role: "manager" },
  { email: "zhs.operator3@gmail.com", firstName: "Айгуль", lastName: "Айгуль", role: "manager" },
  { email: "zhs.operator7@gmail.com", firstName: "Диана", lastName: "Диана", role: "manager" },
  { email: "zhs.operator9@gmail.com", firstName: "Меруерт", lastName: "Меруерт", role: "manager" },
  { email: "zhs.operator4@gmail.com", firstName: "Райхан", lastName: "Райхан", role: "manager" },
];

const PHONE = "+77777777777";

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

type SeedResult = SeedManager & {
  password: string;
  managerCode: string;
  action: "created" | "updated";
};

async function seedOne(m: SeedManager): Promise<SeedResult> {
  const password = generatePassword();

  let firebaseUid: string;
  try {
    const existing = await firebaseAuth.getUserByEmail(m.email);
    firebaseUid = existing.uid;
    await firebaseAuth.updateUser(firebaseUid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "auth/user-not-found"
    ) {
      const created = await firebaseAuth.createUser({
        email: m.email,
        password,
        emailVerified: true,
      });
      firebaseUid = created.uid;
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
    const managerCode =
      existingDb[0].managerCode ?? (await generateUniqueManagerCode());
    await db
      .update(users)
      .set({
        role: m.role,
        firstName: m.firstName,
        lastName: m.lastName,
        phone: PHONE,
        managerCode,
        deactivatedAt: null,
      })
      .where(eq(users.firebaseUid, firebaseUid));
    return { ...m, password, managerCode, action: "updated" };
  }

  const managerCode = await generateUniqueManagerCode();
  await db.insert(users).values({
    firebaseUid,
    email: m.email,
    role: m.role,
    firstName: m.firstName,
    lastName: m.lastName,
    phone: PHONE,
    managerCode,
  });
  return { ...m, password, managerCode, action: "created" };
}

async function main() {
  const results: SeedResult[] = [];
  for (const m of MANAGERS) {
    const r = await seedOne(m);
    console.log(`✓ ${r.action}: ${r.email} (${r.role})`);
    results.push(r);
  }

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("Manager credentials");
  console.log("──────────────────────────────────────────────────────────────");
  for (const r of results) {
    console.log(
      `${r.firstName} ${r.lastName} [${r.role}]\n` +
        `  email:        ${r.email}\n` +
        `  password:     ${r.password}\n` +
        `  manager_code: ${r.managerCode}\n`,
    );
  }
  console.log("──────────────────────────────────────────────────────────────");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
