import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const ROLE_KEY = "role" as const;

interface SessionAuth {
  userId: string;
  role: string | string[] | undefined;
}

/**
 * @clerk/express exposes req.auth() when clerkMiddleware ran. When Clerk keys
 * are absent the middleware is not mounted, so we guard on its presence first
 * and only treat isAuthenticated truths as an actual session.
 */
function getAuth(req: Request): SessionAuth | null {
  if (typeof req.auth !== "function") return null;
  const auth = req.auth() as
    | { isAuthenticated?: boolean; userId?: string; sessionClaims?: { publicMetadata?: unknown } | null }
    | null
    | undefined;
  if (!auth?.isAuthenticated || !auth.userId) return null;

  const meta = auth.sessionClaims?.publicMetadata as
    | { [ROLE_KEY]?: string | string[] }
    | undefined;

  return { userId: auth.userId, role: meta?.role };
}

function hasRole(auth: SessionAuth, role: string) {
  if (Array.isArray(auth.role)) return auth.role.includes(role);
  return auth.role === role;
}

/** Any signed-in user (admin or usher). 401 when unauthenticated. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Requires the caller to carry an ADMIN role claim and exist in the admins table. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!hasRole(auth, "ADMIN")) {
    return res.status(403).json({ error: "Forbidden: ADMIN role required" });
  }
  const admin = await prisma.admin.findUnique({ where: { clerkId: auth.userId } });
  if (!admin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Clerk user is not registered as an admin in this app" });
  }
  res.locals.admin = admin;
  next();
}

/** Resolves the signed-in usher row (for usher-facing routes). */
export async function requireUsher(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const usher = await prisma.usher.findUnique({ where: { clerkId: auth.userId } });
  if (!usher) {
    return res.status(403).json({ error: "Forbidden: Clerk user is not registered as an usher" });
  }
  res.locals.usher = usher;
  next();
}