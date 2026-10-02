import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { plusBaseEmail } from "../lib/account.js";

export const usersRouter = Router();

usersRouter.use(requireAdmin);

interface AdminCandidate {
  id: string;
  userId: string | null;
}

/** Finds an admin profile owned by `email` (exact first, then plus-tag base). */
async function findUnclaimedAdmin(email: string): Promise<AdminCandidate | null> {
  const exact = await prisma.admin.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, userId: true },
  });
  if (exact) return exact;

  const base = plusBaseEmail(email);
  if (!base) return null;

  const admins = await prisma.admin.findMany({
    where: { email: { equals: base, mode: "insensitive" }, userId: null },
    select: { id: true, userId: true },
  });
  return admins.length === 1 ? admins[0] : null;
}

/** GET /api/users — all accounts with their linked profile status. */
usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      admin: { select: { id: true } },
      usher: { select: { id: true, isActive: true } },
    },
  });
  res.json({
    users: users.map((u) => ({
      ...u,
      isAdmin: u.admin !== null,
      usherId: u.usher?.id ?? null,
      usherIsActive: u.usher?.isActive ?? null,
      admin: undefined,
      usher: undefined,
    })),
  });
});

/** POST /api/users/:id/admin — promote an account to admin (link or create the admin profile). */
usersRouter.post("/:id/admin", async (req, res) => {
  // NOTE: route is requireAdmin-gated; admins may act on any account
  // (promoting/demoting is the point of this router — cross-tenant scope intentional).
  // nosemgrep
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const already = await prisma.admin.findUnique({ where: { userId: user.id } });
  if (already) {
    return res.json({ admin: already });
  }

  const candidate = await findUnclaimedAdmin(user.email);
  if (candidate) {
    if (candidate.userId && candidate.userId !== user.id) {
      return res.status(409).json({ error: "That admin profile is already claimed" });
    }
    // NOTE: candidate came from an email-scoped lookup; route is
    // requireAdmin-gated (promote/demote is cross-tenant by design).
    // nosemgrep
    const admin = await prisma.admin.update({
      where: { id: candidate.id },
      data: { userId: user.id, email: user.email, name: user.name },
    });
    return res.json({ admin });
  }

  const admin = await prisma.admin.create({
    data: { name: user.name, email: user.email, userId: user.id },
  });
  res.status(201).json({ admin });
});

/** DELETE /api/users/:id/admin — demote an admin (unlink the account; the profile row stays). */
usersRouter.delete("/:id/admin", async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { userId: req.params.id } });
  if (!admin) {
    return res.status(404).json({ error: "That user is not linked to an admin profile" });
  }
  // NOTE: admin.id came from the userId-scoped lookup just above; route
  // is requireAdmin-gated (promote/demote is cross-tenant by design).
  // nosemgrep
  await prisma.admin.update({ where: { id: admin.id }, data: { userId: null } });
  res.json({ ok: true });
});