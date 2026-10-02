import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const XSRF_COOKIE = "XSRF-TOKEN";
const XSRF_HEADER = "x-xsrf-token";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Synchronizer-token CSRF protection for the cookie-session API.
 *
 * Registers immediately after `cookieParser`: reads the incoming `XSRF-TOKEN`
 * cookie and sets a fresh readable `XSRF-TOKEN` cookie on every response (the
 * SPA reads it via JS). For state-changing methods it requires that value to
 * be echoed back in the `X-XSRF-TOKEN` header. Cross-site requests cannot set
 * that header without a CORS preflight that our fixed-origin policy rejects,
 * and 64-hex tokens are unguessable. This is belt-and-suspenders on top of
 * SameSite=Lax.
 *
 * The check only fires when a valid token cookie is already present, so a
 * brand-new client (no cookie yet) is never brickwalled — the threat this
 * block is a forged state-change riding on an already-signed-in cookie.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const incoming = (req.cookies as Record<string, string> | undefined)?.[XSRF_COOKIE];
  const valid = typeof incoming === "string" && TOKEN_PATTERN.test(incoming);
  const token = valid ? incoming : randomBytes(32).toString("hex");

  res.cookie(XSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (UNSAFE_METHODS.has(req.method) && valid && req.header(XSRF_HEADER) !== incoming) {
    return res.status(403).json({ error: "CSRF token missing or invalid" });
  }
  next();
}