import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

// Generates a 6-digit numeric code that is unique across users.manager_code.
// Uses CSPRNG so codes can't be guessed from each other — a manager code is
// effectively a low-entropy invite secret.
// Retries on collision (with 1M possible codes and few staff, collisions are rare).
export async function generateUniqueManagerCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomInt(100000, 1000000).toString();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.managerCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Failed to generate unique manager code after 20 attempts");
}
