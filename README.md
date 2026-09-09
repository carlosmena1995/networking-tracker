# Networking Tracker

A private contact tracker for the people you want to stay connected with at
Berkeley. You sign in, add the people you meet — name, company, role, where you
met, notes and a priority — and sort, filter, edit and delete them. Every
contact belongs to exactly one account, and that ownership is enforced by
Postgres Row Level Security rather than by application code, so it holds even
if someone bypasses the app and calls the public data endpoint directly.

**Live app:** _<!-- LIVE_URL -->_

---

## Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack and why](#tech-stack-and-why)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Tests](#tests)
- [Grading evidence](#grading-evidence)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Screenshots

_<!-- SCREENSHOTS -->_

## Features

- Email and password sign up, sign in and sign out
- Add a contact with name, company, role, where you met, notes and priority
- Priority is restricted to `high`, `medium` or `low`
- View contacts as a table on desktop and as cards on mobile
- Sort by name, company, priority or date added, ascending or descending
- Filter by priority and search across name, company, role and where you met
- Edit and delete, with a confirmation step before deleting
- Contacts persist in Neon Postgres and survive a refresh
- Distinct loading, empty, error and success states
- Validation failures show a message on the specific field that caused them

## Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript) | One project holds the React UI and the HTTP API, while still keeping them in separate layers. Deploys to Vercel with no configuration. |
| Styling | Tailwind CSS 4 + shadcn/ui | shadcn/ui gives accessible, unstyled-by-default components (dialog, select, toast) that I own in-repo, so the design system is visible in the code rather than hidden in a dependency. |
| Auth | Neon Managed Better Auth | Users and sessions live in the same Postgres database as the data, so `auth.user_id()` is available inside RLS policies. No second system to keep in sync. |
| Data | Neon Data API (PostgREST) via `@neondatabase/neon-js` | Requests carry the user's own JWT, so Postgres evaluates RLS per request. The server never holds a privileged database credential. |
| Validation | Zod + Postgres `CHECK` constraints | Zod produces friendly per-field errors; the `CHECK` constraints are the rule that cannot be bypassed. |
| Tests | Vitest | Fast, TypeScript-native, no extra config for path aliases. |
| Hosting | Vercel | First-class Next.js support and per-environment variables. |

## Architecture

```
Browser (React client components)
  │
  │  fetch('/api/contacts')          same-origin, session cookie attached
  ▼
Next.js route handlers               ← the backend
  │  1. auth.getSession()  → 401 if signed out
  │  2. Zod validation     → 400 + field errors if invalid
  │  3. auth.token()       → the signed-in user's JWT
  ▼
Neon Data API (PostgREST)            Authorization: Bearer <user's JWT>
  ▼
Postgres
     RLS policies  → which rows        (auth.user_id() = user_id)
     GRANTs        → which columns     (no user_id on INSERT/UPDATE)
     CHECK         → which values      (priority, non-empty name)
```

**Frontend.** Client components in `components/` own all interaction: the
sign-in form, the contact table/cards, the create-edit dialog, sort and filter
controls. They never talk to Neon directly — only to `/api/*` on the same
origin.

**Backend.** Route handlers in `app/api/` are the only place that reads a
session or writes data. Each one authenticates, validates, then delegates to
`lib/contacts-repo.ts`.

**Auth.** `app/api/auth/[...path]/route.ts` proxies Better Auth through our own
domain. That is deliberate: it makes the session cookie first-party, so the
server can read it. The browser client (`lib/auth/client.ts`) therefore points
at `/api/auth`, not at the Neon auth host.

**Data.** `lib/contacts-repo.ts` builds a Data API client whose `getToken`
returns the caller's JWT. Notice there is no `.eq('user_id', …)` filter
anywhere in that file — RLS already restricts the rows, and adding a redundant
filter would imply security depends on remembering to write it.

### Where the two public URLs are used

`NEXT_PUBLIC_NEON_AUTH_URL` and `NEXT_PUBLIC_NEON_DATA_API_URL` are the two
URLs the assignment's "two-URL object form" refers to. They are HTTPS endpoints,
not credentials — publishing them is safe precisely because RLS protects every
row behind them. `scripts/rls-check.mts` proves that by attacking those URLs
directly.

## Database schema

Full DDL: [`db/schema.sql`](db/schema.sql).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, `default gen_random_uuid()` |
| `user_id` | `text` | **`not null default auth.user_id()`** — the owner |
| `name` | `text` | `not null`, must be non-blank after trimming, ≤ 200 chars |
| `company` | `text` | Nullable, ≤ 200 chars |
| `role` | `text` | Nullable, ≤ 200 chars |
| `met_at` | `text` | Nullable, ≤ 200 chars — where you met |
| `notes` | `text` | Nullable, ≤ 2000 chars |
| `priority` | `text` | `not null`, `check (priority in ('high','medium','low'))` |
| `created_at` | `timestamptz` | `not null default now()` |
| `updated_at` | `timestamptz` | `not null default now()`, maintained by a trigger |

Index on `(user_id, created_at desc)`, matching the only query the app makes.

## Authentication and RLS ownership

When someone signs in, Neon Managed Better Auth issues a JWT whose `sub` claim
is that user's id. Every Data API request carries that JWT, and inside Postgres
`auth.user_id()` returns the `sub` claim as text. **The ownership rule is one
line, applied four times:**

```sql
auth.user_id() = user_id
```

Three independent mechanisms enforce it:

**1. RLS decides which rows.** Four separate policies, one per verb, all scoped
to the `authenticated` role:

| Policy | Clause | What it stops |
|---|---|---|
| `contacts_select_own` | `USING` | Reading someone else's contact |
| `contacts_insert_own` | `WITH CHECK` | Creating a row owned by someone else |
| `contacts_update_own` | `USING` + `WITH CHECK` | Editing someone else's row, **and** editing your row so it becomes theirs |
| `contacts_delete_own` | `USING` | Deleting someone else's contact |

The `UPDATE` policy needs both clauses. `USING` chooses which existing rows you
may target; `WITH CHECK` re-tests the row *after* your change. Without
`WITH CHECK`, you could take your own row and rewrite `user_id` to hand it to
another user — which is exactly what check 3 in the RLS script tries.

**2. Column grants decide which columns.** `authenticated` is granted
`INSERT`/`UPDATE` only on the six editable columns. `user_id` is not among
them, so a caller cannot supply or change an owner even before RLS is
consulted. On insert, the column default fills it in.

**3. `force row level security`** means the policies apply even to the table
owner, so a privileged connection cannot quietly bypass them.

Ownership is never read from the request body. `lib/validation.ts` strips
unknown keys, so a `user_id` sent by a client is discarded before it reaches the
database — and two tests assert exactly that.

## Local setup

```bash
git clone https://github.com/carlosmena1995/networking-tracker.git
cd networking-tracker
npm install
```

Then create the Neon project and apply the schema — the full walkthrough is in
[`docs/neon-setup.md`](docs/neon-setup.md). Afterwards:

```bash
cp .env.example .env.local   # fill in the values from the Neon Console
npm run dev                  # http://localhost:3000
```

## Environment variables

Names only — real values live in `.env.local` (git-ignored) and in Vercel.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_NEON_AUTH_URL` | Public | Neon Managed Better Auth endpoint |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | Public | Neon Data API (PostgREST) endpoint |
| `NEON_AUTH_BASE_URL` | **Server only** | Auth base URL used by the server SDK |
| `NEON_AUTH_COOKIE_SECRET` | **Server only** | Signs the session cookie (32+ chars) |
| `DATABASE_URL` | **Server only** | Applying `db/schema.sql`; the app never reads it |

The two `NEXT_PUBLIC_` values are inlined into the browser bundle by design.
They are addresses, not secrets: RLS is what protects the data behind them. The
three server-only values are never referenced from a client component, and
`lib/auth/server.ts` is marked `import 'server-only'` so a mistaken import
fails the build rather than leaking at runtime.

## Tests

```bash
npm test          # validation + route handler tests (no database needed)
npm run test:rls  # two-account privacy proof against the real database
```

`npm test` covers two things:

- **`tests/validation.test.ts`** — the shared rules: empty and whitespace-only
  names rejected, `priority: "urgent"` rejected, all three valid priorities
  accepted, length limits, trimming, and that `user_id`/`id` are stripped from
  input.
- **`tests/api-contacts.test.ts`** — the route handlers with auth and the
  database mocked: every verb returns 401 when signed out *and never calls the
  database*, invalid bodies return 400 with a per-field message and no write is
  attempted, malformed JSON does not 500, and a caller-supplied `user_id` is
  never forwarded.

`npm run test:rls` is the security proof and is described under
[Grading evidence](#grading-evidence).

## Grading evidence

_<!-- EVIDENCE -->_

## Deployment

```bash
npm install -g vercel
vercel            # preview
vercel --prod     # production
```

Then:

1. Vercel → Settings → Environment Variables: add all five variables. Only the
   two `NEXT_PUBLIC_` ones are public.
2. Neon Console → Auth → Configuration → Domains: add
   `https://<your-app>.vercel.app`. Localhost is allowed automatically, so this
   step only matters in production - and skipping it breaks verification and
   OAuth redirects there.
3. Open the production URL in a private window and re-run the checks.

## Known limitations

- **Email verification is off.** Any address can register. Fine for a graded
  demo; a real deployment should require verification before first sign-in.
- **Sorting by priority is finished in the API process.** Postgres would sort
  `high, low, medium` alphabetically, so the rank order is applied in
  `lib/contacts-repo.ts` after fetching. That is correct but would not scale to
  thousands of rows — the fix is a Postgres `enum` or a sort-order column.
- **No pagination.** Every contact is fetched at once, which is fine at personal
  scale and wrong at a few thousand rows.
- **Search runs as `ILIKE`** across four columns. It has no index behind it and
  no ranking; `pg_trgm` or a `tsvector` column would fix both.
- **No optimistic UI.** Every mutation waits for the server round trip, so the
  UI is honest but feels slower than it could.

### What I would do next

1. Pagination plus a `tsvector` search column and a GIN index.
2. Email verification and a password reset flow.
3. Tags and a "last contacted" date with a nudge for people going stale.
4. An RLS regression test in CI against a Neon preview branch, so a policy can
   never silently regress.
