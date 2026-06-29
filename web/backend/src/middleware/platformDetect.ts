// Reads the X-Client-Platform header the mobile app sends ('ios' | 'android')
// and attaches it as req.clientPlatform. App-level middleware (registered once
// in index.ts), so every route can read it without per-route wiring.
//
// Used to enforce App Store rules: on iOS, digital goods must be bought via
// Apple In-App Purchase, so the BCC card flow is blocked for digital orders
// coming from the iOS app. Web/admin requests omit the header → undefined,
// which never triggers the iOS-only guards. See
// docs/ios-appstore-compliance-tz.md.

import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      clientPlatform?: "ios" | "android";
    }
  }
}

export function platformDetect(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.headers["x-client-platform"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "ios" || value === "android") {
    req.clientPlatform = value;
  }
  next();
}
