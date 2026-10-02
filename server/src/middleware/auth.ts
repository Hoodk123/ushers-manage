import type { NextFunction, Request, Response } from "express";
import type { LocalSession } from "./session.js";

function getSession(res: Response): LocalSession | null {
  return (res.locals.session as LocalSession | undefined) ?? null;
}

/** Any signed-in account. 401 when unauthenticated. */
export function requireUser(_req: Request, res: Response, next: NextFunction) {
  if (!getSession(res)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Admin access. Grants admin routes when the account is linked to an admins row. */
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const session = getSession(res);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!session.admin) {
    return res.status(403).json({
      error: "Forbidden: this account is not linked to an admin profile",
    });
  }
  res.locals.admin = session.admin;
  next();
}

/** Usher access. Grants usher-facing routes when the account is linked to an ushers row. */
export function requireUsher(_req: Request, res: Response, next: NextFunction) {
  const session = getSession(res);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!session.usher) {
    return res.status(403).json({
      error: "Forbidden: this account is not linked to an usher profile",
    });
  }
  res.locals.usher = session.usher;
  next();
}