# Auth & Roles

Self-managed auth — no third-party identity provider. The Express server owns
the full flow: password sign-up/login (Argon2id-hashed), opaque session
cookies backed by the `sessions` table, and per-request role enforcement.

## How a session works

- **Signup** creates a `User` row (Argon2id-hashed password), signs the user
  in, and returns the raw session token once (in the response) plus sets the
  `sid` cookie.
- **Login** verifies a password (admin) or the shared team token (usher) and
  starts a new session.
- The raw token is never persisted: only its SHA-256 digest lands in
  `sessions`, so a database leak cannot be replayed. The browser stores an
  opaque `sid` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, 7 days) and sends
  it with every request; the API re-derives the hash to look the session up by
  digest.
- `GET /api/auth/me` returns the current `{ user, session }` (or `{ user:
  null }` when signed out).
- `POST /api/auth/logout` deletes the session row and clears the cookie.

## Roles

| Session role          | DB row  | Access                                  |
| --------------------- | ------- | --------------------------------------- |
| `ADMIN` (password)    | `Admin` | manage team, services, shifts, rotation |
| `USHER` (team token)  | `Usher` | my schedule only                        |

- An **admin** signs up with an email + password. The first signup links the
  `User` row to the seeded `Admin` row matching `SEED_ADMIN_EMAIL`; re-running
  `npm run db:seed` with the same email pre-links it directly.
- An **usher** authenticates with the shared `USHER_SIGNUP_TOKEN` from
  `server/.env`; their first `GET /api/my-schedule` creates their `Usher` row.
  The token is the usher credential — keep it secret and rotate it (new token
  + `UPDATE sessions SET digest = '' WHERE usherId IS NOT NULL;`) if it leaks.

The `sessions.role` claim is enforced by `requireAdmin` / `requireUsher` on
every request, not just at sign-in.

## Status

Implemented end-to-end (client UI forms + API guards + hashed-session storage)
and verified by the E2E script: signup / login / `GET /api/auth/me` / `401`
/ `409` duplicate / usher linkage to 4 seeded ushers / admin routes /
`my-schedule` / promote / demote / logout all pass with persistence assertions
(Argon2id hash prefix `$argon2id$`, 64-hex session digest, PII log scan).