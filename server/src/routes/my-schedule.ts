import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireUsher } from "../middleware/auth.js";

export const myScheduleRouter = Router();

myScheduleRouter.use(requireUsher);

/** GET /api/my-schedule — the signed-in usher's upcoming shifts */
myScheduleRouter.get("/", async (_req, res) => {
  const usher = res.locals.usher as { id: string };
  const shifts = await prisma.shift.findMany({
    where: { usherId: usher.id },
    orderBy: { service: { date: "asc" } },
    include: {
      service: {
        select: { id: true, name: true, date: true, location: true, notes: true },
      },
    },
  });
  res.json({ shifts });
});

const statusSchema = z.object({
  status: z.enum(["CONFIRMED", "DECLINED"]),
});

/** PATCH /api/my-schedule/:shiftId — confirm or decline an assigned shift */
myScheduleRouter.patch("/:shiftId", async (req, res) => {
  const usher = res.locals.usher as { id: string };
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const shift = await prisma.shift.findFirst({
    where: { id: req.params.shiftId, usherId: usher.id, status: "ASSIGNED" },
  });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found or already responded to" });
  }

  const updated = await prisma.shift.update({
    where: { id: shift.id, usherId: shift.usherId },
    data: { status: parsed.data.status },
  });
  res.json({ shift: updated });
});