import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";

export const ushersRouter = Router();

ushersRouter.use(requireAdmin);

const usherSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().nullable(),
  clerkId: z.string().trim().optional().nullable(),
});

/** GET /api/ushers — list the admin's ushers */
ushersRouter.get("/", async (_req, res) => {
  const admin = res.locals.admin as { id: string };
  const ushers = await prisma.usher.findMany({
    where: { adminId: admin.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { shifts: true } },
      queueEntry: true,
    },
  });
  res.json({ ushers });
});

/** POST /api/ushers — create an usher (and enqueue them at the tail of the rotation) */
ushersRouter.post("/", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const parsed = usherSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const data = parsed.data;

  const existing = await prisma.usher.findUnique({ where: { email: data.email } });
  if (existing) {
    return res.status(409).json({ error: "An usher with that email already exists" });
  }

  const usher = await prisma.$transaction(async (tx) => {
    const created = await tx.usher.create({
      data: {
        adminId: admin.id,
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        clerkId: data.clerkId ?? null,
      },
    });
    const maxPos = await tx.rotationQueueEntry.findFirst({
      where: { adminId: admin.id },
      orderBy: { position: "desc" },
    });
    await tx.rotationQueueEntry.create({
      data: {
        adminId: admin.id,
        usherId: created.id,
        position: (maxPos?.position ?? 0) + 1,
      },
    });
    return created;
  });

  res.status(201).json({ usher });
});

/** PATCH /api/ushers/:id — update an usher */
ushersRouter.patch("/:id", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const parsed = usherSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const existing = await prisma.usher.findFirst({
    where: { id: req.params.id, adminId: admin.id },
  });
  if (!existing) {
    return res.status(404).json({ error: "Usher not found" });
  }

  const usher = await prisma.usher.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.clerkId !== undefined ? { clerkId: parsed.data.clerkId } : {}),
    },
  });
  res.json({ usher });
});

/** DELETE /api/ushers/:id — remove an usher (shifts and queue entry cascade) */
ushersRouter.delete("/:id", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const existing = await prisma.usher.findFirst({
    where: { id: req.params.id, adminId: admin.id },
  });
  if (!existing) {
    return res.status(404).json({ error: "Usher not found" });
  }
  await prisma.usher.delete({ where: { id: existing.id } });
  res.status(204).end();
});