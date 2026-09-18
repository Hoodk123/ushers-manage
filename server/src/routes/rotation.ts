import { Router } from "express";
import type { Shift } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";

export const rotationRouter = Router();

rotationRouter.use(requireAdmin);

/** GET /api/rotation — the FIFO queue with each usher's shift history */
rotationRouter.get("/", async (_req, res) => {
  const admin = res.locals.admin as { id: string };
  const queue = await prisma.rotationQueueEntry.findMany({
    where: { adminId: admin.id },
    orderBy: { position: "asc" },
    include: {
      usher: {
        include: {
          _count: { select: { shifts: true } },
        },
      },
    },
  });
  res.json({ queue });
});

const generateSchema = z.object({
  serviceId: z.string().min(1),
  count: z.coerce.number().int().min(1).max(20),
});

/**
 * POST /api/rotation/generate — assign ushers to a service using FIFO.
 *
 * Picks the first `count` ushers from the front of the rotation queue who are active
 * and not already assigned to that service, creates a Shift for each,
 * then rotates them to the back of the queue (fair rotation).
 */
rotationRouter.post("/generate", async (req, res) => {
  const admin = res.locals.admin as { id: string };

  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const { serviceId, count } = parsed.data;

  const service = await prisma.worshipService.findFirst({
    where: { id: serviceId, adminId: admin.id },
  });
  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  const result = await prisma.$transaction(
    async (tx) => {
    const queue = await tx.rotationQueueEntry.findMany({
      where: { adminId: admin.id },
      orderBy: { position: "asc" },
      include: { usher: { select: { id: true, isActive: true, name: true } } },
    });

    const existing = await tx.shift.findMany({ where: { serviceId } });
    const assignedIds = new Set(existing.map((s) => s.usherId));

    const candidates = queue.filter((e) => e.usher.isActive && !assignedIds.has(e.usher.id));
    const picks = candidates.slice(0, count);

    if (picks.length === 0) {
      return { service, shifts: [], rotated: [] };
    }

    const shifts: Shift[] = [];
    for (const pick of picks) {
      shifts.push(await tx.shift.create({ data: { usherId: pick.usher.id, serviceId } }));
    }

    // Rotate the chosen ushers to the back, renumbering the queue 1..N.
    const pickIds = new Set(picks.map((p) => p.usher.id));
    const remaining = queue.filter((e) => !pickIds.has(e.usher.id));

    let pos = 0;
    for (const entry of remaining) {
      pos += 1;
      await tx.rotationQueueEntry.update({ where: { id: entry.id }, data: { position: pos } });
    }
    for (const pick of picks) {
      pos += 1;
      await tx.rotationQueueEntry.update({ where: { id: pick.id }, data: { position: pos } });
    }

    return { service, shifts, rotated: picks.map((p) => p.usher.name) };
    },
    // Neon round-trips are slow; Prisma's 5s default is too tight.
    { timeout: 30_000, maxWait: 10_000 }
  );

  res.status(201).json(result);
});