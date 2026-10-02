# API Reference

Base URL: `http://localhost:4000` (dev).

## Authentication

The API uses **cookie sessions**, not bearer tokens. Sign in with
`POST /api/auth/login` (or `/signup`); the server sets an opaque `sid` cookie
(`HttpOnly`, `Secure`, `SameSite=Lax`, 7 days) that client browsers and
Postman's cookie jar echo back automatically. The raw session token is shown
only once at creation; the DB stores its SHA-256 digest, so a database leak
cannot be replayed.

Roles come from the `sessions` table, which records the session type at
creation (an admin password sign-in vs. an usher team-token sign-in):

- `requireAdmin` — rejects unless the session role is `ADMIN`.
- `requireUsher` — rejects unless the session role is `USHER`.

Both guards re-check `sessions.role` on every request.

## Testing with Postman

Postman's cookie jar handles the session automatically:

1. `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
   (admin) or `{ "token": "<USHER_SIGNUP_TOKEN>" }` (usher) — the response
   sets the `sid` cookie.
2. Every subsequent request already carries the cookie — no auth header.

A `401` on `/api/auth/me` with a fresh jar means you're not signed in; a `403`
means the session lacks the required role (e.g. an usher session hitting an
ADMIN endpoint).

| Endpoint                    | Role  | Expected with a signed-in admin session |
| --------------------------- | ----- | --------------------------------------- |
| `GET /api/health`           | none  | `{ "status": "ok", "db": "deacondb" }` |
| `GET /api/auth/me`          | none  | `{ "user": {...}, "session": {...} }`  |
| `GET /api/services`         | ADMIN | `[]` (200)                             |
| `GET /api/rotation`         | ADMIN | `[]` (200) — the FIFO queue            |
| `GET /api/ushers`           | ADMIN | `[]` (200) plus shift/queue counts     |
| `POST /api/services`        | ADMIN | `201` with `{ name, date }` body       |
| `GET /api/my-schedule`      | USHER | `403` for an admin session (no ushers row) |

## Auth — `/api/auth`

| Method | Path     | Auth  | Description                                                |
| ------ | -------- | ----- | ---------------------------------------------------------- |
| GET    | `/me`    | none  | Current user + session (`{ user: null }` when signed out)  |
| POST   | `/signup`| none  | Admin sign-up; argon2id-hashes the password, signs in      |
| POST   | `/login` | none  | Password (admin) or team-token (usher) sign-in             |
| POST   | `/logout`| auth  | Ends the session and clears the cookie                     |

`POST /api/auth/signup` body:

```json
{ "email": "admin@example.com", "password": "..." }
```

Creates the `User` row and links it to the `Admin` row matching
`SEED_ADMIN_EMAIL`. The response echoes the raw session token once alongside
the session and sets the `sid` cookie.

`POST /api/auth/login` body (choose one):

```json
{ "email": "admin@example.com", "password": "..." }
{ "token": "<USHER_SIGNUP_TOKEN>" }
```

## Health

| Method | Path          | Auth | Description                          |
| ------ | ------------- | ---- | ------------------------------------ |
| GET    | `/api/health` | none | DB connectivity check (`{ status, db }`) |

## Ushers — `/api/ushers`

| Method | Path   | Auth  | Description                          |
| ------ | ------ | ----- | ------------------------------------ |
| GET    | `/`    | ADMIN | List the admin's ushers + shift counts and queue position |
| POST   | `/`    | ADMIN | Create an usher; enqueues them at the tail of the rotation queue |
| PATCH  | `/:id` | ADMIN | Update name / email / phone          |
| DELETE | `/:id` | ADMIN | Remove an usher (shifts + queue entry cascade) |

Create/update body:

```json
{ "name": "Jane Doe", "email": "jane@example.com", "phone": "+254..." }
```

## Services — `/api/services`

| Method | Path   | Auth  | Description                       |
| ------ | ------ | ----- | --------------------------------- |
| GET    | `/`    | ADMIN | List the admin's worship services |
| POST   | `/`    | ADMIN | Create a worship service          |
| PATCH  | `/:id` | ADMIN | Update name / date / location / notes |
| DELETE | `/:id` | ADMIN | Remove a service (shifts cascade) |

Create/update body:

```json
{ "name": "Sunday Morning", "date": "2026-09-20T08:00:00Z", "location": "Main Auditorium", "notes": "" }
```

## Rotation — `/api/rotation`

| Method | Path            | Auth  | Description                          |
| ------ | --------------- | ----- | ------------------------------------ |
| GET    | `/`             | ADMIN | The FIFO rotation queue (ushers + positions) |
| POST   | `/generate`     | ADMIN | Assign ushers to a service (FIFO) then rotate |

`POST /generate` body:

```json
{ "serviceId": "service_...", "count": 4 }
```

Picks the first `count` active ushers from the front of the queue who are not
already assigned to that service, creates a `Shift` for each, and rotates those
ushers to the back of the queue.

## My Schedule — `/api/my-schedule`

Requires an `USHER` session (the `Usher` row is created on first access).

| Method | Path        | Auth  | Description                          |
| ------ | ----------- | ----- | ------------------------------------ |
| GET    | `/`         | USHER | The signed-in usher's shifts         |
| PATCH  | `/:shiftId` | USHER | Confirm or decline an assigned shift |

Update body:

```json
{ "status": "CONFIRMED" }   // or "DECLINED"
```

Only shifts in `ASSIGNED` state can be updated.