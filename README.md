# Deacons Manage

Church ushers & deacons management system — an admin dashboard plus a
mobile-first usher client with fair, automatic rotation scheduling.

## Stack

| Layer      | Tech                                             |
| ---------- | ------------------------------------------------ |
| Database   | Neon (PostgreSQL 18), Prisma ORM                 |
| API        | Node.js + Express 5 + TypeScript, self-managed session auth (Argon2id + DB-backed sessions) |
| Web client | Vite + React 19 + TypeScript + CSS               |
| Repo       | npm workspaces monorepo (`frontend`, `server`)   |
| CI/CD      | GitHub Actions (typecheck, build, lint, audit, semgrep, secret scan) |

## Structure

```
deacons-manage/
  frontend/            React web client
  server/              Express API + Prisma
    prisma/            schema + migrations + seed
    scripts/           db checks
    src/               app entry, lib, routes
  docs/                architecture, API, features
```

## Quick start

```bash
npm install
cp server/.env.example server/.env   # fill real values, incl. SEED_ADMIN_PASSWORD
npm run db:migrate                   # applies migrations
npm run db:seed                      # admin + 4 ushers
npm run dev
```

- API: `http://localhost:4000` (health: `/api/health`)
- Client: `http://localhost:5173` — sign in with the seeded admin account

See [docs/setup.md](docs/setup.md) for full setup.