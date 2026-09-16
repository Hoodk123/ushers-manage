# Setup

## Prerequisites

- Node.js >= 20 (project targets Node 24)
- npm >= 10
- A Neon project with a `deacondb` database (connection string in `DATABASE_URL`)
- A Clerk application (optional until auth routes are enabled)

## 1. Install

```bash
npm install
```

This installs the root `concurrently`, plus all `frontend` and `server`
dependencies hoisted by npm workspaces.

## 2. Environment

Server (API + database):

```bash
cp server/.env.example server/.env
```

Required for the database:

```
DATABASE_URL="postgresql://.../deacondb?sslmode=require"
```

The publishable key lives in **both** places — the server uses it

Frontend (Vite reads keys from its own `.env`, prefixed `VITE_`):

```bash
cp frontend/.env.example frontend/.env
```

```
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

> Note: the publishable key is safe to embed in the client bundle and is meant
> to be public. The `CLERK_SECRET_KEY` must never be shipped to the browser.

Optional (enables Clerk auth on the API):

```
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."
```

Both `server/.env` and `frontend/.env` are git-ignored.

## 3. Database migrations

```bash
npm run db:migrate      # prisma migrate dev
npm run db:seed         # sample admin + 4 ushers
npm run db:check        # masked connectivity check (prints host + db name only)
```

## 4. Run

```bash
npm run dev
```

- API: `http://localhost:4000` — `/api/health` confirms DB connectivity
- Client: `http://localhost:5173`

## Troubleshooting

- `Publishable key is missing` — Clerk keys not set; either add them or keep
  auth disabled for local API work.
- DB seed unique errors — the seed uses `upsert` by email so it is idempotent;
  re-run safely.