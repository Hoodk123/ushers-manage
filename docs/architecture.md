# Architecture

## System overview

```
React (Vite)  ──>  Express API  ──>  Neon (PostgreSQL via Prisma)
    │                    │
    └── Clerk (auth)  ──┘
```

Two roles, enforced first by Clerk (on the JWT) and second by the API:

- **ADMIN** — the leader. Creates and manages their usher team, schedules
  services, generates shifts via the rotation queue.
- **USHER** — a member of the admin's team. Views "My Schedule", confirms or
  declines assigned shifts.

Role lives in Clerk user metadata (`publicMetadata.role`). The API reads it
from the verified session and rejects mismatches.

## Database (Prisma)

| Model                | Purpose                                        | Key relation              |
| -------------------- | ---------------------------------------------- | ------------------------- |
| `Admin`              | The leader                                     | `1─N` Usher, Service, Queue |
| `Usher`              | Team member, child of Admin                    | `N─1` Admin                |
| `WorshipService`     | A scheduled service needing ushers             | `1─N` Shift                |
| `Shift`              | One usher assigned to one service              | `N─1` Usher / Service      |
| `RotationQueueEntry` | FIFO fair-rotation order, per admin            | `N─1` Admin / Usher        |

### Rotation

`RotationQueueEntry` stores a per-admin ordered queue (`position`, unique per
admin). When shifts are generated for a service, ushers are pulled from the
front of the queue; after use their entry moves to the back — keeping duty
distribution fair.

## API layering

- `middleware` — Clerk `requireAuth`, admin-role guard
- `routes` — feature routers (ushers, services, shifts, me)
- `lib` — Prisma client singleton, rotation helpers

## Monorepo conventions

- Root `package.json` declares `frontend` + `server` as npm workspaces.
- `npm run dev` runs both via `concurrently`.
- `server/prisma.config.ts` is the Prisma config (schema, seed).
- Secrets only in `server/.env` (gitignored); `server/.env.example` holds
  placeholders.