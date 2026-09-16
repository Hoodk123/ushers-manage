# API Reference

Base URL: `http://localhost:4000` (dev). Auth via Bearer token in the
`Authorization` header (`<token>` from Clerk).

All routes under `/api/ushers`, `/api/services`, and `/api/rotation` require an
**ADMIN** role claim (`publicMetadata.role = "ADMIN"`) **and** a matching row in
the `admins` table (`clerkId` must equal the Clerk user id).

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

Requires an **USHER** role claim and a matching `ushers` row (`clerkId`).

| Method | Path          | Auth  | Description                          |
| ------ | ------------- | ----- | ------------------------------------ |
| GET    | `/`           | USHER | The signed-in usher's shifts         |
| PATCH  | `/:shiftId`   | USHER | Confirm or decline an assigned shift |

Update body:

```json
{ "status": "CONFIRMED" }   // or "DECLINED"
```

Only shifts in `ASSIGNED` state can be updated.