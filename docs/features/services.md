# Services

Worship services that need usher coverage.

- `POST /api/services` — schedule a service (name, date, location, notes)
- `GET /api/services` — upcoming services
- `PATCH /api/services/:id` — reschedule / edit
- `DELETE /api/services/:id` — cancel (cascades shifts)

Each service belongs to the admin who created it (`WorshipService.adminId`).
Shifts for a service can be generated from the rotation queue.

## Status

DB model ready. Router TBD.