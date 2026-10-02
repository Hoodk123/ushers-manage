import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashSessionToken, newSessionToken, SESSION_TTL_MS } from "../lib/security.js";

export const SESSION_COOKIE = "Auth-Token";

export interface LocalSession {
  user: { id: string; email: string; name: string };
  admin: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  } | null;
  usher: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    adminId: string;
  } | null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * Reads the Auth-Token cookie, looks up the matching (non-expired) session and
 * exposes the signed-in user + their admin/usher profiles on res.locals.session.
 * Calls next() regardless; an absent/invalid/expired session just yields no
 * context and (when the cookie was bogus) gets cleared.
 */
export async function resolveSession(_req: Request, res: Response, next: NextFunction) {
  const token: string | undefined = (_req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token) {
    res.locals.session = undefined;
    return next();
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { admin: true, usher: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.locals.session = undefined;
    return next();
  }

  res.locals.session = {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    admin: session.user.admin
      ? {
          id: session.user.admin.id,
          name: session.user.admin.name,
          email: session.user.admin.email,
          phone: session.user.admin.phone,
          avatarUrl: session.user.admin.avatarUrl,
        }
      : null,
    usher: session.user.usher
      ? {
          id: session.user.usher.id,
          name: session.user.usher.name,
          email: session.user.usher.email,
          phone: session.user.usher.phone,
          avatarUrl: session.user.usher.avatarUrl,
          adminId: session.user.usher.adminId,
        }
      : null,
  };
  next();
}

/** Creates a DB session row and sets the HttpOnly cookie on the response. */
export async function createSession(res: Response, userId: string): Promise<string> {
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
  return tokenHash;
}

/** Best-effort delete of the cookie's session row, then clears the cookie. */
export async function destroyCurrentSession(req: Request, res: Response): Promise<void> {
  const token: string | undefined = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}