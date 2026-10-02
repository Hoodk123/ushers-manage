import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { csrfProtection } from "./middleware/csrf.js";
import { resolveSession } from "./middleware/session.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { ushersRouter } from "./routes/ushers.js";
import { servicesRouter } from "./routes/services.js";
import { rotationRouter } from "./routes/rotation.js";
import { myScheduleRouter } from "./routes/my-schedule.js";

export const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));

// Cookie parsing first, then the CSRF guard: it reads the incoming
// XSRF-TOKEN cookie via req.cookies and, on unsafe methods, requires the
// value to be echoed back in the X-XSRF-TOKEN header. Every handler below is
// therefore behind the guard.
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json());

// Resolves the Auth-Token session cookie into res.locals.session (if any).
app.use(resolveSession);

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

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/ushers", ushersRouter);
app.use("/api/services", servicesRouter);
app.use("/api/rotation", rotationRouter);
app.use("/api/my-schedule", myScheduleRouter);

app.get("/", (_req, res) => {
  res.json({ name: "Deacons Manage API", version: "0.1.0", health: "/api/health" });
});