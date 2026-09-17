# API Reference

Base URL: `http://localhost:4000` (dev). Auth via Bearer token in the
`Authorization` header (`<token>` from Clerk).

Roles come from **table membership**, not the JWT: `requireAdmin` checks the
`admins` table and `requireUsher` checks the `ushers` table (both keyed on the
Clerk user id in `clerkId`). If a signed-in user has no row yet, the guard
attempts a one-time link-by-email as a fallback before denying.

## Clerk Webhooks — `/api/webhooks/clerk`

| Method | Path          | Auth  | Description                |
| ------ | ------------- | ----- | -------------------------- |
| POST   | `/api/webhooks/clerk` | Svix signed | Clerk → Neon user sync |

Called by Clerk (no Bearer token). Requests must carry the Svix
`svix-id`/`svix-timestamp`/`svix-signature` headers; the signature is verified
against `CLERK_WEBHOOK_SECRET`. Handled events:

- `user.created` / `user.updated` — link the Clerk user to the seeded
  `admins`/`ushers` row by email, assign the role, and write it back to Clerk
  `publicMetadata.role` so sessions carry it.
- `user.deleted` — remove the matching admin/usher row.

## Health

| Method | Path          | Auth | Description                          |
| ------ | ------------- | ---- | ------------------------------------ |
| GET    | `/api/health` | none | DB connectivity check (`{ status, db }`) |

## Ushers — `/api/ushers`

| Method | Path          | Auth  | Description                          |
| ------ | ------------- | ----- | ------------------------------------ |
| GET    | `/`           | ADMIN | List the admin's ushers + shift counts and queue position |
| POST   | `/`           | ADMIN | Create an usher; enqueues them at the tail of the rotation queue |
| PATCH  | `/:id`        | ADMIN | Update name / email / phone / clerkId |
| DELETE | `/:id`        | ADMIN | Remove an usher (shifts + queue entry cascade) |

Create/update body:

```json
{ "name": "Jane Doe", "email": "jane@example.com", "phone": "+254...", "clerkId": "user_..." }
```

## Services — `/api/services`

| Method | Path          | Auth  | Description                       |
| ------ | ------------- | ----- | --------------------------------- |
| GET    | `/`           | ADMIN | List the admin's worship services |
| POST   | `/`           | ADMIN | Create a worship service          |
| PATCH  | `/:id`        | ADMIN | Update name / date / location / notes |
| DELETE | `/:id`        | ADMIN | Remove a service (shifts cascade) |

Create/update body:

```json
{ "name": "Sunday Morning", "date": "2026-09-20T08:00:00Z", "location": "Main Auditorium", "notes": "" }
```

## Rotation — `/api/rotation`

| Method | Path              | Auth  | Description                          |
| ------ | ----------------- | ----- | ------------------------------------ |
| GET    | `/`               | ADMIN | The FIFO rotation queue (ushers + positions) |
| POST   | `/generate`       | ADMIN | Assign ushers to a service (FIFO) then rotate |

`POST /generate` body:

```json
{ "serviceId": "service_...", "count": 4 }
```

Picks the first `count` active ushers from the front of the queue who are not
already assigned to that service, creates a `Shift` for each, and rotates those
ushers to the back of the queue.

## My Schedule — `/api/my-schedule`

Requires a matching `ushers` row (`clerkId`).

| Method | Path          | Auth  | Description                          |
| ------ | ------------- | ----- | ------------------------------------ |
| GET    | `/`           | USHER | The signed-in usher's shifts         |
| PATCH  | `/:shiftId`   | USHER | Confirm or decline an assigned shift |

Update body:

```json
{ "status": "CONFIRMED" }   // or "DECLINED"
```

Only shifts in `ASSIGNED` state can be updated.