# Admin Dashboard — Screen 1 Build Spec

Scope: the app shell (sidebar + topbar) and the landing dashboard an admin
sees immediately after signing in. Nothing else. Everything beyond this
screen is listed under "Parked for later" at the bottom — don't build any
of it yet, just don't lose track of it either.

---

## 1. Install shadcn components needed for this screen

```bash
npx shadcn@latest add sidebar sheet separator dropdown-menu avatar card table badge button skeleton
```

`sidebar` is shadcn's own app-shell primitive — it already collapses to a
mobile `Sheet` (slide-out drawer) under 768px automatically, with no custom
responsive logic needed. Don't hand-roll a sidebar; use this component.

---

## 2. App shell layout

- `SidebarProvider` wraps the whole authenticated app (mount it once, above
  the router, not per-page).
- **Flat navigation — no nested/expandable menu items.** Every sidebar entry
  is a single top-level link straight to its page:
  - Dashboard (this screen)
  - Team
  - Services
  - Rotation
  - My Schedule *(only shown if viewing as an usher — not relevant to admin
    view for now)*
- Topbar / sidebar footer: use the app's existing `LogoutButton` (from
  `frontend/src/auth-provider.tsx`'s `useAuth`) for account/sign-out — it
  calls `POST /api/auth/logout` and clears the session cookie, and the
  `AuthProvider` flips the shell back to the guest sign-in screen automatically.
- On mobile (<768px), the sidebar becomes the Sheet automatically via the
  shadcn component — just wire `SidebarTrigger` into the topbar so there's
  a visible hamburger icon to open it. Confirm this actually works at a
  real 375px-wide viewport before calling this step done, not just in a
  resized desktop browser.

---

## 3. Dashboard content — top to bottom

### A. Stat cards row (4 `Card` components, `grid-cols-2` on mobile, `grid-cols-4` on desktop)

1. **Team size** — active ushers / total ushers (e.g. "4 / 4 active")
2. **Upcoming services** — count of services with a future date
3. **Needs coverage** — count of upcoming services with zero or partial
   usher assignment. This is the one that should visually stand out
   (different accent color) since it's the thing requiring action.
4. **Pending confirmations** — count of `Shift` rows still in `ASSIGNED`
   status (usher hasn't confirmed or declined yet)

Pull #1 from `GET /api/ushers` (already working). #2–#4 depend on the
Services and Rotation routers, which aren't built yet — see note in
section 4.

### B. "Needs your attention" panel

A single list, not split into scary/blaming categories. Two kinds of
entries, same visual treatment:

- An upcoming service with no usher assigned yet → "Sunday Morning, Oct 12
  — no ushers assigned" with a button to go generate/assign coverage.
- A shift that was **declined** → "James Mwangi declined Oct 12 — needs
  reassignment", with a button to reassign, not a flag on the usher.

Framing matters here: nothing in this panel should read as "so-and-so
didn't show up" or imply a failure — ushers are volunteers, declining a
shift they can't make is a normal, expected action, not a problem to
surface as one. The copy should always center the *service that needs
someone*, never the person who said no.

### C. Team preview

A small `Table` (not the full Team management page — that's its own
screen) showing name, phone number, and an active/inactive `Badge` for
each usher, capped at ~5 rows with a "View all" link to the Team page.
Phone numbers here are for the admin's quick reference (e.g. before
calling someone about a schedule change), so make them tappable
`tel:` links on mobile.

### D. Rotation preview

Small card showing who's next in the FIFO queue (`RotationQueueEntry`
ordered by `position`, take the first 1–3). No interaction needed here
yet — just visibility.

---

## 4. Data notes

- `/api/ushers` is confirmed working — use it for the Team size stat and
  Team preview table now.
- `/api/services` and `/api/rotation` are not built yet on the backend.
  Build this screen defensively: wrap each of those fetches so that a
  missing/failing endpoint renders an empty state ("No services scheduled
  yet") instead of crashing the whole dashboard. Use shadcn `Skeleton`
  components for the loading state on all four stat cards and both preview
  sections.
- Don't fake data to make the dashboard look complete — empty/zero states
  are the honest and correct thing to show until those routers exist.

---

## 5. Responsiveness checklist before calling this screen done

- [ ] Sidebar becomes a Sheet drawer below 768px, triggered by a visible
      hamburger button
- [ ] Stat card grid: 2 columns on mobile, 4 on desktop
- [ ] Team preview table doesn't force horizontal scroll on a 375px
      viewport — if needed, drop to a stacked card layout per usher on
      mobile instead of a literal `<table>`
- [ ] Phone numbers are `tel:` links, tappable on a real phone
- [ ] Tested at 375px (small phone), 768px (tablet breakpoint), and
      desktop — not just resized in a desktop browser dev tool at a
      random width

---

## Parked for later (explicitly not building yet)

Noted so nothing raised gets lost, revisit in a future pass:

- Monthly usher-to-Sunday planning calendar, generated from the rotation
- Shareable / downloadable version of that monthly calendar
- Setting specific times per service/event
- Announcements / messaging board for schedule changes
- A "Word shared on Sunday" post/board visible to all ushers
- Dress-code and other standing notices posted by the admin
- Usher-side explicit availability toggle (beyond the existing
  confirm/decline on an assigned shift)
- Syncing the app's service schedule with an external church calendar
