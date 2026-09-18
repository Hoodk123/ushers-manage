# Security & Code Quality Guardrails — Agent Instructions

Give this file to the coding agent as its brief. Goal: set up automated
scanning (CodeQL, secret scanning, dependency scanning, Semgrep) across the
monorepo, and follow a fixed set of secure-coding rules when writing or
touching server code — especially anything that touches Prisma, auth, or the
rotation logic.

---

## 1. Repo layout assumption

Monorepo with npm workspaces:

```
/frontend   (React + Vite)
/server     (Express + Prisma + Clerk)
```

All workflows below should scope to the relevant workspace using
`paths:` filters so a frontend-only PR doesn't block on server checks and
vice versa.

---

## 2. CodeQL (SAST)

Create `.github/workflows/codeql.yml`:

```yaml
name: "CodeQL"

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "23 4 * * 1"   # weekly

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
      actions: read

    strategy:
      matrix:
        language: ["javascript-typescript"]

    steps:
      - uses: actions/checkout@v4

      - uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          queries: security-extended

      - uses: github/codeql-action/autobuild@v3

      - uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

- Free for public repos; requires GitHub Advanced Security for private repos.
- Findings land under the repo's **Security → Code scanning alerts** tab.
- Enable **Copilot Autofix** (Settings → Code security) so alerts get a
  suggested fix / PR automatically — this is the piece that plugs directly
  into an AI-driven workflow instead of a human triaging every alert.

---

## 3. Secret scanning — gitleaks

Create `.github/workflows/gitleaks.yml`:

```yaml
name: "Secret Scan"

on:
  push:
  pull_request:

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Also add a `.gitleaks.toml` allowlist for known-safe placeholders (e.g. the
`pk_test_...` example strings in `.env.example` files), so the scanner
doesn't flag your own docs.

Also add it as a **pre-commit hook** (not just CI) so a leaked
`CLERK_SECRET_KEY` or `DATABASE_URL` never even reaches a push:

```bash
npx husky add .husky/pre-commit "gitleaks protect --staged --redact"
```

---

## 4. Dependency scanning — Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "npm"
    directory: "/server"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Turn on, separately, in **Settings → Code security**:
- Dependabot alerts (on by default for public repos)
- Dependabot security updates (auto-PRs for vulnerable deps specifically —
  faster signal than the weekly version-bump PRs above)

Add an `npm audit` gate as a belt-and-suspenders check in your normal CI job:

```yaml
- run: npm audit --workspaces --audit-level=high
```

---

## 5. Semgrep (custom rules, including Prisma/DB-specific ones)

Create `.github/workflows/semgrep.yml`:

```yaml
name: Semgrep

on:
  pull_request:
  push:
    branches: [main]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci --config auto --config .semgrep/
```

`semgrep ci --config auto` pulls community rulesets (good general JS/TS/Node
coverage) for free without an account. The `.semgrep/` folder is for your own
rules, which is where you encode schema-specific guardrails. Suggested custom
rules for this codebase — ask the agent to write these as Semgrep YAML rules:

- Flag any `prisma.$queryRawUnsafe` or `$executeRawUnsafe` call (this schema
  has no legitimate reason to use either).
- Flag any route handler that reads `req.params.id` / `req.body` and passes
  it straight into a `where: { id: ... }` Prisma call **without** also
  scoping by `adminId` — this is the IDOR risk described below.
- Flag any `console.log` / `console.error` call whose arguments include a
  variable named like `email`, `phone`, `clerkId`, or a full `usher`/`admin`
  object (PII in logs).

---

## 6. Secure-coding rules the agent should follow (schema-specific)

These map directly to `schema.prisma` as shared:

1. **Every query must be scoped by ownership, not just by id.**
   `Usher`, `WorshipService`, `Shift`, and `RotationQueueEntry` all trace
   back to an `Admin` via `adminId` (directly or through a relation). Any
   handler that does `prisma.usher.findUnique({ where: { id } })` off a
   client-supplied id, without also checking `adminId === session.adminId`,
   is an IDOR: any signed-in admin could read or modify another admin's
   ushers/services/shifts by guessing/enumerating cuids. Require a
   `where: { id, adminId }` (or an explicit follow-up ownership check)
   everywhere.

2. **Rotation must run inside a transaction.** Advancing the queue
   (creating `Shift` rows + moving used ushers to the back of
   `RotationQueueEntry`) is multiple writes that must succeed or fail
   together — wrap it in `prisma.$transaction([...])`. Without this, a
   crash mid-operation can leave the queue and shift table out of sync
   (e.g. an usher assigned twice, or `position` values colliding against
   the `@@unique([adminId, position])` constraint).

3. **Never trust client input for `status` transitions.** `Shift.status`
   should only move `ASSIGNED → CONFIRMED/DECLINED` and only by the usher
   who owns that shift (`shift.usherId === session.usherId`), never by
   arbitrary PATCH. Validate the transition server-side, not just the enum
   value.

4. **Validate all external input with a schema library (zod or similar)**
   before it reaches Prisma — email format, phone format, `date` as a real
   ISO datetime, `count` in rotation generation as a positive bounded
   integer (an unbounded `count` lets someone request an absurd number of
   shifts in one call).

5. **Clerk webhook hardening**
   - Verify the Svix signature before touching the payload (per your
     `api.md` — make sure this is enforced, not optional).
   - Treat the webhook handler as public/unauthenticated by design, but rate
     limit it and reject anything that doesn't parse to the three expected
     event types.
   - The link-by-email fallback in `requireAdmin`/`requireUsher` should
     never *create* an Admin/Usher row — only link an existing one. Confirm
     this stays true; it's the difference between "self-heals a race
     condition" and "lets anyone self-promote to admin with the right
     email."

6. **No PII in logs.** `email`, `phone`, `clerkId` should never be logged in
   plaintext in request logging middleware or error handlers — log the
   internal `id` instead.

7. **Indexes.** `Shift` is queried by `usherId` and by `serviceId`
   independently (My Schedule, and service coverage view) in addition to the
   composite unique — add `@@index([usherId])` and `@@index([serviceId])` if
   not already covered, so those lookups don't full-scan as data grows.

8. **Cascading deletes are intentional here but double-edged.** Deleting an
   `Admin` cascades through everything (ushers, services, shifts, queue).
   Make sure there's no route that lets a non-owner trigger an admin
   deletion, and consider a confirmation step / soft-delete for `Admin`
   given the blast radius.

---

## 7. What to tell the agent to actually do

Paste this whole file to the agent along with:

> Set up the CodeQL, gitleaks, Dependabot, and Semgrep configs exactly as
> specified in this document, scoped correctly for the `/frontend` and
> `/server` workspaces. Then review `server/` against the 8 secure-coding
> rules in section 6 and open a PR per rule (or one combined PR) fixing any
> gaps you find — do not silently change behavior beyond what's needed to
> close the gap, and note in the PR description which rule each change
> addresses.

Having the agent both write the workflow files *and* do the first pass
against your own schema-specific rules is reasonable — these are mechanical,
verifiable changes (a human/CI can confirm each workflow runs and each rule
fix compiles and passes tests), which is exactly the kind of AI-written code
that's easy to check. Just review the resulting PRs yourself before merging,
especially anything touching the auth guards or the rotation transaction.
