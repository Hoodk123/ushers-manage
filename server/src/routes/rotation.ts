import { Router } from "express";
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

/**
 * POST /api/rotation/generate — assign ushers to a service using FIFO.
 *
 * Picks the first `count` ushers from the front of the rotation queue who are active
 * and not already assigned to that service, creates a Shift for each,
 * then rotates them to the back of the queue (fair rotation).
 */
rotationRouter.post("/generate", async (req, res) => {
  const admin = res.locals.admin as { id: string };

  const serviceId = (req.body as { serviceId?: string })?.serviceId;
  const count = Number((req.body as { count?: number })?.count);

  if (!serviceId || !Number.isInteger(count) || count < 1) {
    return res.status(400).json({ error: "serviceId (string) and count (positive integer) are required" });
  }

  const service = await prisma.worshipService.findFirst({
    where: { id: serviceId, adminId: admin.id },
  });
  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  const result = await prisma.$transaction(async (tx) => {
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

    const shifts = await Promise.all(
      picks.map((pick) =>
        tx.shift.create({
          data: { usherId: pick.usher.id, serviceId },
        })
      )
    );

    // Rotate the chosen ushers to the back, renumbering the queue 1..N.
    const pickIds = new Set(picks.map((p) => p.usher.id));
    const remaining = queue.filter((e) => !pickIds.has(e.usher.id));

    let pos = 0;
    const updates = remaining.map((e) => {
      pos += 1;
      return tx.rotationQueueEntry.update({ where: { id: e.id }, data: { position: pos } });
    });
    for (const pick of picks) {
      pos += 1;
      updates.push(
        tx.rotationQueueEntry.update({ where: { id: pick.id }, data: { position: pos } })
      );
    }
    await Promise.all(updates);

    return { service, shifts, rotated: picks.map((p) => p.usher.name) };
  });

  res.status(201).json(result);
});