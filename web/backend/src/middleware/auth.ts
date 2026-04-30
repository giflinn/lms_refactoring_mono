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
    const decoded = await firebaseAuth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
