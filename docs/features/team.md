# Team (Ushers)

Admins manage their usher roster. Each usher is a child of the admin who leads
them.

- `POST /api/ushers` — add an usher (optionally enqueueing them in rotation)
- `GET /api/ushers` — list my team (active first)
- `GET /api/ushers/:id` — detail
- `PATCH /api/ushers/:id` — update name/phone/email/avatar
- `DELETE /api/ushers/:id` — remove (cascades shifts + queue entry)

An usher is **active** by default. Inactive ushers are skipped by rotation but
kept in the roster.

Enforced at the DB level: `Usher.adminId → Admin.id` with `onDelete: Cascade`,
so an usher always belongs to exactly one leader.

## Status

DB model + seed ready. Router TBD.