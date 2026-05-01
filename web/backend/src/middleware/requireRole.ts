import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type userRoleEnum } from "../db/schema";

type Role = (typeof userRoleEnum.enumValues)[number];

declare global {
  namespace Express {
    interface Request {
      // Populated by requireStaffAdmin / requireAdmin after looking the
      // authenticated user up in our DB. Downstream handlers use these instead
      // of re-querying.
      actorId?: string;
      actorRole?: Role;
    }
  }
}

// Loads the DB row for the authenticated Firebase identity (req.uid set by
// requireAuth) and asserts the user's role is in `allowed`. On success
// attaches actorId + actorRole to the request.
function makeGuard(allowed: readonly Role[]) {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    try {
      const rows = await db
        .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
        .from(users)
        .where(eq(users.firebaseUid, uid))
        .limit(1);
      if (rows.length === 0) {
        res.status(404).json({ error: "user_not_registered" });
        return;
      }
      const row = rows[0];
      if (row.deactivatedAt) {
        res.status(403).json({ error: "account_deactivated" });
        return;
      }
      if (!allowed.includes(row.role)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      req.actorId = row.id;
      req.actorRole = row.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireStaffAdmin = makeGuard(["senior_manager", "admin"] as const);
export const requireAdmin = makeGuard(["admin"] as const);
