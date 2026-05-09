// Picks the staff member who should own a client at registration time
// (no manager code provided) or at redistribution time (after a manager is
// deactivated).
//
// The strategy and optional specific target are admin-configurable knobs
// stored in app_settings under MANAGER_ASSIGNMENT_KEYS.
//
// Resolution rules (same for both flows):
//   strategy === 'specific'
//     → return target_id if it points to an active staff user
//       (and not the user being excluded, e.g. the manager being deleted)
//       → otherwise fall through to admin fallback
//   strategy === 'any_admin' | 'any_senior_manager' | 'any_manager'
//     → among active staff of that role (minus excluded), pick the one with
//       the fewest clients currently assigned. Natural even-distribution:
//       each call sees updated counts so calling N times in a loop spreads
//       evenly without a separate counter.
//     → if pool is empty, fall through to admin fallback
//   admin fallback
//     → oldest active admin (by created_at, ascending) minus the excluded
//       user. The seeded admin guarantees this always resolves on a
//       healthy install.
//
// If even the admin fallback returns nothing, the function returns null —
// the caller decides whether to refuse the action or assign no manager.
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import {
  SETTING_KEYS,
  getSetting,
  setSetting,
  type SettingKey,
} from "./appSettings";

// Either the top-level Drizzle db or a transaction handle inside a
// db.transaction() callback. Both expose the same select/update/insert
// surface, so picker functions accept either via this loose alias.
// Using `typeof db` directly conflicts with the tx type (extra rollback
// method on tx), but querying methods are interchangeable.
type Executor = Pick<typeof db, "select">;

export type AssignmentStrategy =
  | "any_admin"
  | "any_senior_manager"
  | "any_manager"
  | "specific";

export const VALID_STRATEGIES: ReadonlySet<AssignmentStrategy> = new Set([
  "any_admin",
  "any_senior_manager",
  "any_manager",
  "specific",
]);

export type AssignmentScope = "on_register" | "on_delete";

export type AssignmentConfig = {
  strategy: AssignmentStrategy;
  targetUserId: string | null;
};

const STRATEGY_TO_ROLE: Record<
  Exclude<AssignmentStrategy, "specific">,
  "admin" | "senior_manager" | "manager"
> = {
  any_admin: "admin",
  any_senior_manager: "senior_manager",
  any_manager: "manager",
};

function strategyKey(scope: AssignmentScope): SettingKey {
  return scope === "on_register"
    ? SETTING_KEYS.managerAssignmentOnRegisterStrategy
    : SETTING_KEYS.managerAssignmentOnDeleteStrategy;
}

function targetKey(scope: AssignmentScope): SettingKey {
  return scope === "on_register"
    ? SETTING_KEYS.managerAssignmentOnRegisterTargetId
    : SETTING_KEYS.managerAssignmentOnDeleteTargetId;
}

export async function getAssignmentConfig(
  scope: AssignmentScope,
): Promise<AssignmentConfig> {
  const [strategyRaw, targetRaw] = await Promise.all([
    getSetting(strategyKey(scope)),
    getSetting(targetKey(scope)),
  ]);
  const strategy: AssignmentStrategy = VALID_STRATEGIES.has(
    strategyRaw as AssignmentStrategy,
  )
    ? (strategyRaw as AssignmentStrategy)
    : "any_admin";
  const targetUserId = targetRaw && targetRaw.length > 0 ? targetRaw : null;
  return { strategy, targetUserId };
}

export async function setAssignmentConfig(
  scope: AssignmentScope,
  config: AssignmentConfig,
  updatedByUserId: string,
): Promise<void> {
  // Clear the target id when strategy isn't 'specific' so stale UUIDs don't
  // linger in the table and confuse later reads.
  const target = config.strategy === "specific" ? config.targetUserId ?? "" : "";
  await Promise.all([
    setSetting(strategyKey(scope), config.strategy, updatedByUserId),
    setSetting(targetKey(scope), target, updatedByUserId),
  ]);
}

// Internal: pick the active staff user with the lowest current client load
// in the given role group. Excludes a specific user (e.g. the manager being
// deleted). Returns null when the pool is empty.
async function pickByRoleLoad(
  exec: Executor,
  role: "admin" | "senior_manager" | "manager",
  excludeUserId: string | null,
): Promise<string | null> {
  const conditions = [eq(users.role, role), isNull(users.deactivatedAt)];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));

  const clientCount = sql<number>`(
    SELECT COUNT(*)::int
    FROM ${users} AS clients
    WHERE clients.manager_id = ${users.id}
  )`;

  const rows = await exec
    .select({ id: users.id, load: clientCount, createdAt: users.createdAt })
    .from(users)
    .where(and(...conditions))
    .orderBy(clientCount, asc(users.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

// Internal: oldest active admin minus the excluded user. The "always works
// on a healthy install" safety net since admin is seeded.
async function fallbackOldestAdmin(
  exec: Executor,
  excludeUserId: string | null,
): Promise<string | null> {
  const conditions = [eq(users.role, "admin"), isNull(users.deactivatedAt)];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

// Internal: confirm the configured 'specific' target is still a usable
// active staff user (and not the one being excluded). If it isn't, the
// caller should fall through to the admin fallback.
async function pickSpecific(
  exec: Executor,
  targetId: string | null,
  excludeUserId: string | null,
): Promise<string | null> {
  if (!targetId) return null;
  if (excludeUserId && targetId === excludeUserId) return null;
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, targetId),
        inArray(users.role, ["manager", "senior_manager", "admin"]),
        isNull(users.deactivatedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

async function pickByConfig(
  exec: Executor,
  scope: AssignmentScope,
  excludeUserId: string | null,
): Promise<string | null> {
  const cfg = await getAssignmentConfig(scope);
  if (cfg.strategy === "specific") {
    const found = await pickSpecific(exec, cfg.targetUserId, excludeUserId);
    if (found) return found;
  } else {
    const role = STRATEGY_TO_ROLE[cfg.strategy];
    const found = await pickByRoleLoad(exec, role, excludeUserId);
    if (found) return found;
  }
  return fallbackOldestAdmin(exec, excludeUserId);
}

// Called from the no-code branch of /auth/sync. Returns a manager id to
// stamp on the new user's row, or null if even the admin fallback can't
// resolve (extreme edge case — the caller should still allow the insert
// with managerId=null in that case).
export function pickManagerForRegistration(): Promise<string | null> {
  return pickByConfig(db, "on_register", null);
}

// Called once per client of the manager being deleted, inside the same
// transaction as the deactivation. Pass the transaction handle (`tx`) so
// the picker sees the in-flight client-count updates from earlier
// iterations — without it, every client lands on whoever had the lowest
// load at transaction start. Excludes the manager being deleted from
// every candidate pool.
export function pickManagerForRedistribution(
  exec: Executor,
  deletedUserId: string,
): Promise<string | null> {
  return pickByConfig(exec, "on_delete", deletedUserId);
}
