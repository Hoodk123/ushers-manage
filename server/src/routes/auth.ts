import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { linkProfilesToUser, provisionUsherForUser } from "../lib/account.js";
import { hashPassword, verifyPassword } from "../lib/security.js";
import {
  createSession,
  destroyCurrentSession,
  type LocalSession,
} from "../middleware/session.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests — try again later" },
});

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email required").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

/** {user, admin, usher} payload derived from a fully-loaded session context. */
async function loadSessionContext(userId: string): Promise<LocalSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { admin: true, usher: true },
  });
  if (!user) throw new Error("session user vanished");
  return {
    user: { id: user.id, email: user.email, name: user.name },
    admin: user.admin
      ? {
          id: user.admin.id,
          name: user.admin.name,
          email: user.admin.email,
          phone: user.admin.phone,
          avatarUrl: user.admin.avatarUrl,
        }
      : null,
    usher: user.usher
      ? {
          id: user.usher.id,
          name: user.usher.name,
          email: user.usher.email,
          phone: user.usher.phone,
          avatarUrl: user.usher.avatarUrl,
          adminId: user.usher.adminId,
        }
      : null,
  };
}

/** GET /api/auth/me — the signed-in account + linked profiles (200, user:null when guest). */
authRouter.get("/me", (req, res) => {
  const session = (res.locals.session as LocalSession | undefined) ?? null;
  res.json({ user: session?.user ?? null, admin: session?.admin ?? null, usher: session?.usher ?? null });
});

/** POST /api/auth/signup — create an account, link it to profile rows by email, log it in. */
authRouter.post("/signup", authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(
    async (tx) => {
      const created = await tx.user.create({ data: { name, email, passwordHash } });

      const linked = await linkProfilesToUser(tx, created.id, email);

      if (!linked.adminId && !linked.usherId) {
        await provisionUsherForUser(tx, created.id, name, email);
      }
      return created;
    },
    // Neon round-trips are slow; Prisma's 5s default is too tight here.
    { timeout: 30_000, maxWait: 10_000 }
  );

  await createSession(res, user.id);
  const context = await loadSessionContext(user.id);
  res.status(201).json({ user: context.user, admin: context.admin, usher: context.usher });
});

/** POST /api/auth/login — verify credentials and start a session. */
authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  await createSession(res, user.id);
  const context = await loadSessionContext(user.id);
  res.json({ user: context.user, admin: context.admin, usher: context.usher });
});

/** POST /api/auth/logout — destroy the current session and clear the cookie. */
authRouter.post("/logout", async (req, res) => {
  await destroyCurrentSession(req, res);
  res.status(204).end();
});