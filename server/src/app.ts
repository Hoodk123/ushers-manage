import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { prisma } from "./lib/prisma.js";
import { ushersRouter } from "./routes/ushers.js";
import { servicesRouter } from "./routes/services.js";
import { rotationRouter } from "./routes/rotation.js";
import { myScheduleRouter } from "./routes/my-schedule.js";

export const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
if (hasClerkKeys) {
  app.use(clerkMiddleware());
} else {
  console.warn("[warn] Clerk keys missing — auth disabled. Set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY in server/.env");
}

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`;
    res.json({ status: "ok", db: "connected", ts: new Date().toISOString() });
  } catch (err) {
    res
      .status(503)
      .json({ status: "error", db: "unreachable", ts: new Date().toISOString(), reason: (err as Error).message });
  }
});

app.use("/api/ushers", ushersRouter);
app.use("/api/services", servicesRouter);
app.use("/api/rotation", rotationRouter);
app.use("/api/my-schedule", myScheduleRouter);

app.get("/", (_req, res) => {
  res.json({ name: "Deacons Manage API", version: "0.1.0", health: "/api/health" });
});