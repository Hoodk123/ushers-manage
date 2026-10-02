# Architecture

## System overview

```
React (Vite)  --credentials-->  Express API  -->  Neon (PostgreSQL via Prisma)
    │   (HttpOnly sid cookie)          │
    └────── /api/auth/{signup,login,logout,me} ───┘
```

Two roles, enforced on **every request** by the API from its own session
records (no external identity provider):

- **ADMIN** — the leader. Creates and manages their usher team, schedules
  services, generates shifts via the rotation queue.
- **USHER** — a member of the admin's team. Views "My Schedule", confirms or
  declines assigned shifts.

Role lives in the `sessions` table (set at sign-in, re-read per request). The
route guards (`requireAdmin` / `requireUsher`) reject a session whose role
does not match the route.

## Database (Prisma)

| Model                | Purpose                                        | Key relation              |
| -------------------- | ---------------------------------------------- | ------------------------- |
| `User`               | Sign-in identity (argon2id-hashed password)    | `1─0..1` Admin            |
| `Session`            | Hashed-session digest + role + expiry, `sid` cookie | `N─1` User        |
| `Admin`              | The leader                                     | `1─N` Usher, Service, Queue |
| `Usher`              | Team member, child of Admin                    | `N─1` Admin                |
| `WorshipService`     | A scheduled service needing ushers             | `1─N` Shift                |
| `Shift`              | One usher assigned to one service              | `N─1` Usher / Service      |
| `RotationQueueEntry` | FIFO fair-rotation order, per admin            | `N─1` Admin / Usher        |

### Auth flow

- Signup hashes the password with **Argon2id**, creates the `User` row, links
  it to the seeded `Admin` row (matching `SEED_ADMIN_EMAIL`), and opens a
  session.
- The browser stores an opaque `sid` cookie (`HttpOnly`, `Secure`,
  `SameSite=Lax`); the server hashes it and stores only the SHA-256 digest in
  `sessions`, so the raw token never rests at rest and on each request the
  digest lookup is all that's needed.
- Usher sign-in uses the shared team token (`USHER_SIGNUP_TOKEN`); their
  first `GET /api/my-schedule` creates their `Usher` row.

### Rotation

`RotationQueueEntry` stores a per-admin ordered queue (`position`, unique per
admin). When shifts are generated for a service, ushers are pulled from the
front of the queue; after use their entry moves to the back — keeping duty
distribution fair.

## API layering

- `middleware` — session auth guards (`requireAuth`, `requireAdmin`,
  `requireUsher`)
- `routes` — feature routers (auth, ushers, services, rotation, my-schedule)
- `lib` — Prisma client singleton, rotation helpers, security utilities

## Monorepo conventions

- Root `package.json` declares `frontend` + `server` as npm workspaces.
- `npm run dev` runs both via `concurrently`.
- `server/prisma.config.ts` is the Prisma config (schema, seed).
- Secrets only in `server/.env` (gitignored); `server/.env.example` holds
  placeholders. The frontend has no env requirements.