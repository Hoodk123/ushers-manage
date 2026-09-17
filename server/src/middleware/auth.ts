import type { NextFunction, Request, Response } from "express";
import { clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { syncClerkUser, type ClerkRole } from "../lib/sync-user.js";

interface SessionAuth {
  userId: string;
}

/**
 * @clerk/express exposes req.auth() when clerkMiddleware ran. When Clerk keys
 * are absent the middleware is not mounted, so we guard on its presence first
 * and only treat isAuthenticated truths as an actual session.
 */
function getAuth(req: Request): SessionAuth | null {
  if (typeof req.auth !== "function") return null;
  const auth = req.auth() as
    | { isAuthenticated?: boolean; userId?: string }
    | null
    | undefined;
  if (!auth?.isAuthenticated || !auth.userId) return null;
  return { userId: auth.userId };
}

/**
 * JIT fallback: if a signed-in user has no row yet (e.g. they hit the API
 * before the Clerk webhook lands), link their seed record by email.
 * linkOnly keeps this from ever creating new rows on a request path.
 */
async function provisionSessionUser(
  userId: string,
  role: ClerkRole
): Promise<boolean> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) return false;

    const result = await syncClerkUser(
      {
        clerkId: userId,
        email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        role,
      },
      { linkOnly: true }
    );
    return result?.role === role;
  } catch (err) {
    console.warn(`[warn] JIT provisioning failed for ${userId}:`, (err as Error).message);
    return false;
  }
}

/** Any signed-in user (admin or usher). 401 when unauthenticated. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Admin access. Table membership decides the role; JIT-links seeded admins by email. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let admin = await prisma.admin.findUnique({ where: { clerkId: auth.userId } });
  if (!admin && (await provisionSessionUser(auth.userId, "ADMIN"))) {
    admin = await prisma.admin.findUnique({ where: { clerkId: auth.userId } });
  }
  if (!admin) {
    return res
      .status(403)
      .json({ error: "Forbidden: Clerk user is not registered as an admin in this app" });
  }
  res.locals.admin = admin;
  next();
}

/** Resolves the signed-in usher row (for usher-facing routes). JIT-links seeded ushers by email. */
export async function requireUsher(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let usher = await prisma.usher.findUnique({ where: { clerkId: auth.userId } });
  if (!usher && (await provisionSessionUser(auth.userId, "USHER"))) {
    usher = await prisma.usher.findUnique({ where: { clerkId: auth.userId } });
  }
  if (!usher) {
    return res.status(403).json({ error: "Forbidden: Clerk user is not registered as an usher" });
  }
  res.locals.usher = usher;
  next();
}