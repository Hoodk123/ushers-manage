# Setup

## Prerequisites

- Node.js >= 20 (project targets Node 24)
- npm >= 10
- A Neon project with a `deacondb` database (connection string in `DATABASE_URL`)

## 1. Install

```bash
npm install
```

This installs the root `concurrently`, plus all `frontend` and `server`
dependencies hoisted by npm workspaces.

## 2. Server environment

There is only one `.env`: `server/.env`. The frontend needs none — the Vite
proxy forwards `/api` to the server, and auth rides on `HttpOnly` cookies that
the browser stores automatically. (`frontend/.env.example` exists but only to
document that fact.)

```bash
cp server/.env.example server/.env
```

| Variable              | Required | Purpose                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | PostgreSQL connection string (`postgresql://.../deacondb?sslmode=require`) |
| `SEED_ADMIN_PASSWORD` | seeding  | Password the seeded admin account signs in with (bring your own strong one; the example placeholder is NOT a real password) |
| `SEED_ADMIN_EMAIL`    | no       | Email the seed admin is created with (default `admin@example.com`) |
| `USHER_SIGNUP_TOKEN`  | ushers   | Shared random token ushers sign in with (`POST /api/auth/login` `{ "token": ... }`) — generate one with e.g. `npx crypto-js` or `openssl rand -base64 32` |
| `PORT` / `CLIENT_ORIGIN` | no    | Dev defaults `4000` / `http://localhost:5173`                  |
| `SESSION_TTL_DAYS`    | no       | Session lifetime in days (default `7`)                         |

`server/.env` is git-ignored; never commit it.

## 2b. Auth & roles

Self-managed sessions: no external provider, no webhooks.

- **Admin** — `POST /api/auth/signup` with an email + password. Passwords are
  hashed with **Argon2id**. The first admin signup links the `User` row to the
  seeded `Admin` row matching `SEED_ADMIN_EMAIL` (the seed does this directly
  if you seeded after setting the email). The API then sets the session
  cookie.
- **Usher** — `POST /api/auth/login` with the `USHER_SIGNUP_TOKEN`. Their
  first `GET /api/my-schedule` creates their `Usher` row. Ushers have no
  password; the shared token is their credential.

Every request re-checks `sessions.role` against what the route requires
(`requireAdmin` / `requireUsher`), so role mismatches are rejected per call,
not just at sign-in.

## 2c. Testing auth (Postman)

Postman's cookie jar keeps the session automatically — no header setup.

1. `POST http://localhost:4000/api/auth/login` with the body
   `{ "email": "admin@example.com", "password": "<your SEED_ADMIN_PASSWORD>" }`.
   The response sets the `sid` cookie.
2. New request → `GET http://localhost:4000/api/services` → `[]` (200).
3. `GET http://localhost:4000/api/auth/me` → your user + session.
4. `GET /api/my-schedule` → `403` (this is an admin session, not an usher).
5. `POST /api/auth/logout` clears the session.

## 3. Database migrations

```bash
npm run db:migrate      # prisma migrate dev
npm run db:seed         # admin + 4 ushers (needs SEED_ADMIN_PASSWORD in server/.env)
npm run db:check        # masked connectivity check (prints host + db name only)
```

Seeding is driven by `server/.env` (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`)
and uses `upsert` by email, so re-running it is safe.

## 4. Run

```bash
npm run dev
```

- API: `http://localhost:4000` — `/api/health` confirms DB connectivity
- Client: `http://localhost:5173`

`npm run dev` runs both workspaces via `concurrently`.

## Troubleshooting

- **`P1001` / "Can't reach database server" on the first call after idle** —
  this is Neon's compute autosleep waking up. Just retry; the server also
  retries warm-up connect failures. Cold starts add a few seconds.
- **Seed unique errors only if you change emails** — the seed uses `upsert` by
  email; if you re-seed after changing `SEED_ADMIN_EMAIL`, the old admin row
  stays (by design, it may be linked to sign-ins already).
- **Ushers can't sign in** — confirm `USHER_SIGNUP_TOKEN` matches between
  `server/.env` and the value you send.