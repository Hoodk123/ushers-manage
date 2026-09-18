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
   the seeded admin — set `SEED_ADMIN_EMAIL` in `server/.env` to the address you
   sign into Clerk with; plus-tagged test addresses such as
   `admin+clerk_test@example.com` link back to the base `admin@example.com`).

> The webhook is the source of truth. As a fallback for the small race where a
> user hits the API before the webhook lands, `requireAdmin` / `requireUsher`
> also attempt a link-by-email on the first request (never creating rows). The
> link is exact-email first, then plus-tag base, and it never steals a row that
> is already claimed by another Clerk user.

To exercise the webhook itself, use **Clerk Dashboard → Webhooks → your endpoint
→ Send test**. That sends a properly Svix-signed `user.created` for one of your
Clerk users (the endpoint must be reachable — a tunnel like `ngrok http 4000`
works for local dev). For scripted local tests, `svix-cli` can forge signed
requests; Postman alone cannot because the `svix-signature` header is HMAC.

## 2c. Testing auth + linking (Postman)

The API trusts **Clerk session tokens**, not static keys, so every Postman
request carries a Bearer token minted by Clerk for the user you test as.

1. Point the seed at the account you actually sign in with — edit your local
   `server/.env` (git-ignored; never the committed `server/.env.example`):

   ```
   SEED_ADMIN_EMAIL="admin+clerk_test@example.com"
   SEED_ADMIN_CLERK_ID=""
   ```

   - `SEED_ADMIN_EMAIL` is the email the seed admin is created with; make it
     match the Clerk sign-in so the link is a direct exact hit.
   - `SEED_ADMIN_CLERK_ID` is optional. **Leave it empty (recommended)** — the
     guard JIT-links whatever Clerk account signs in (works even when Clerk mints
     a new tester user each session). Setting it to a concrete `user_…` id
     pre-links the seed at `npm run db:seed`, but then a *different* test account
     with another email would be denied, since the row is already claimed.
   - Re-run the seed after a change: `npm run db:seed -w server`.

2. Mint a token: **Clerk Dashboard → Users → your test user → Create test
   token** (dev instances only) and copy it.

3. Postman (base URL `http://localhost:4000`):
   - New request → **Auth → Bearer Token** → paste the token.
   - `GET /api/health` → `{ "status": "ok", "db": "deacondb" }`.
   - `GET /api/services` → `[]` (200) on the first call already: the guard links
     your admin row by email **inline** in that request. A `403` means the
     sign-in email matched no seeded row.
   - `GET /api/rotation`, `GET /api/ushers` → ADMIN, `[]` or the current lists.
   - `POST /api/services` body `{ "name": "Sunday Morning", "date": "2026-09-20T08:00:00Z" }` → 201.
   - `GET /api/my-schedule` → `403` (your test user has an admin row, not an
     ushers row — expected).

4. Confirm the link: `npx prisma studio` → `admins` table → the seed admin has
   `email = admin+clerk_test@example.com` and `clerkId = user_3JTE…` after your
   first successful ADMIN call.

## 3. Database migrations

```bash
npm run db:migrate      # prisma migrate dev
npm run db:seed         # sample admin + 4 ushers
npm run db:check        # masked connectivity check (prints host + db name only)
```

Seeding is driven by `server/.env`:

- `SEED_ADMIN_EMAIL` — the seed admin's email (default `admin@example.com`).
  Use the address you actually log into Clerk with.
- `SEED_ADMIN_CLERK_ID` — optional. Set it to a Clerk user id to link the seed
  admin directly at seed time; leave empty and the API links it on the first
  authenticated request (JIT). No Clerk ids are hardcoded anywhere in code.

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