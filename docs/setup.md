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

## 2b. Clerk → Neon user sync (webhook)

When a user signs up in Clerk, the app links them to the seeded `admins` /
`ushers` rows by email address and assigns their role ("ADMIN" for the seed
admin, "USHER" for everything else). Setup:

1. Add the signing secret to `server/.env`:

   ```
   CLERK_WEBHOOK_SECRET="whsec_..."
   ```

   Get it from **Clerk Dashboard → Webhooks → your endpoint → Signing Secret**.

2. Create the endpoint in Clerk Dashboard:
   - **Endpoint URL:** `<your-api-base>/api/webhooks/clerk`
     (locally use a tunnel such as `ngrok http 4000`; production uses the domain
     the API is served on).
   - **Events:** subscribe to `user.created`, `user.updated`, and `user.deleted`.

3. Restart the API server. The first test sign-up should appear as an usher (or
   the seeded admin if the email matches `admin@example.com`).

> The webhook is the source of truth. As a fallback for the small race where a
> user hits the API before the webhook lands, `requireAdmin` / `requireUsher`
> also attempt a link-by-email on the first request (never creating rows).

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