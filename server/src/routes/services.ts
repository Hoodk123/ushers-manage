import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";

export const servicesRouter = Router();

servicesRouter.use(requireAdmin);

const serviceSchema = z.object({
  name: z.string().trim().min(1),
  date: z.coerce.date(),
  location: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

/** GET /api/services — list the admin's worship services */
servicesRouter.get("/", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const services = await prisma.worshipService.findMany({
    where: { adminId: admin.id },
    orderBy: { date: "desc" },
    include: {
      _count: { select: { shifts: true } },
    },
  });
  res.json({ services });
});

/** POST /api/services — create a worship service */
servicesRouter.post("/", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const data = parsed.data;
  const service = await prisma.worshipService.create({
    data: {
      adminId: admin.id,
      name: data.name,
      date: data.date,
      location: data.location ?? null,
      notes: data.notes ?? null,
    },
  });
  res.status(201).json({ service });
});

/** PATCH /api/services/:id — update a worship service */
servicesRouter.patch("/:id", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const existing = await prisma.worshipService.findFirst({
    where: { id: req.params.id, adminId: admin.id },
  });
  if (!existing) {
    return res.status(404).json({ error: "Service not found" });
  }
  const service = await prisma.worshipService.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.date !== undefined ? { date: parsed.data.date } : {}),
      ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  });
  res.json({ service });
});

/** DELETE /api/services/:id — remove a worship service (shifts cascade) */
servicesRouter.delete("/:id", async (req, res) => {
  const admin = res.locals.admin as { id: string };
  const existing = await prisma.worshipService.findFirst({
    where: { id: req.params.id, adminId: admin.id },
  });
  if (!existing) {
    return res.status(404).json({ error: "Service not found" });
  }
  await prisma.worshipService.delete({ where: { id: existing.id } });
  res.status(204).end();
});