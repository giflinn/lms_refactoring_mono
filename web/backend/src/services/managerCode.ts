import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

// Generates a 6-digit numeric code that is unique across users.manager_code.
// Retries on collision (with 1M possible codes and few staff, collisions are rare).
export async function generateUniqueManagerCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.managerCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Failed to generate unique manager code after 20 attempts");
}
