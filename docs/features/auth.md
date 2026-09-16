# Auth & Roles

Clerk handles sign-in/sign-up on the client (`@clerk/react`) and session
verification on the API (`@clerk/express`).

- Role is stored in Clerk user `publicMetadata.role`: `ADMIN` or `USHER`.
- The API uses `clerkMiddleware()` to attach the auth context and
  `requireAuth` to protect routes. An **admin guard** rejects a valid session
  whose role is not `ADMIN`.
- When an admin first signs in, the API upserts their `Admin` row keyed by
  `clerkId`. Ushers log in through their admin — the usher row is looked up by
  `clerkId` once linked.

## Mapping

| Clerk user | DB row     | Access                                   |
| ---------- | ---------- | ---------------------------------------- |
| role ADMIN | `Admin`    | manage team, services, shifts, rotation  |
| role USHER | `Usher`    | my schedule only                         |

TBD during implementation: Clerk webhooks (user.created / user.updated) keep
the DB in sync with the Clerk account.

## Status

Data model ready; API auth wiring is set up to activate once
`CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` exist in `server/.env`.