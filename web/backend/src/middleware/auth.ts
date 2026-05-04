import { Request, Response, NextFunction } from "express";
import { firebaseAuth } from "../firebase";

declare global {
  namespace Express {
    interface Request {
      uid?: string;
      email?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    // checkRevoked=true rejects tokens issued before revokeRefreshTokens was
    // called for the user (deletion / password reset). Without it, a deleted
    // user keeps API access for up to ~1h until their token naturally refreshes.
    const decoded = await firebaseAuth.verifyIdToken(token, true);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (
      code === "auth/id-token-revoked" ||
      code === "auth/user-disabled" ||
      code === "auth/user-not-found"
    ) {
      res.status(401).json({ error: "session_revoked" });
      return;
    }
    res.status(401).json({ error: "invalid_token" });
  }
}
