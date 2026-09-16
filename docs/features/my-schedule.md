# My Schedule (Usher)

Mobile-first view for ushers to see their upcoming duties.

- `GET /api/me/schedule` — my shifts (upcoming first)
- `POST /api/me/shifts/:id/confirm` — accept a shift
- `POST /api/me/shifts/:id/decline` — decline a shift

`Shift.status` lifecycle:

```
ASSIGNED  ──►  CONFIRMED  ──►  SERVED
   │
   └──►  DECLINED   (re-queued by admin)
```

Declined shifts become free again; the admin can regenerate or reassign.

## Status

DB model + enum ready. Routes TBD.