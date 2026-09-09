# Neon setup

Everything here happens once, in the Neon Console. It cannot be scripted from
the repo because creating a project needs your Neon login.

At the end you will have four values for `.env.local`.

---

## 1. Create the project

1. Sign in at <https://console.neon.tech> and create a project.
2. Note the branch you are on (`production` by default). Managed Better Auth and
   the Data API are enabled **per branch**.

## 2. Enable Managed Better Auth

Console → your project → **Auth**, then enable it.

Neon creates a `neon_auth` schema holding users and sessions, and gives you an
**Auth URL** shaped like:

```
https://ep-xxxx-yyyy.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth
```

While you are on that page:

- Enable **Email and password** as a sign-in method.

Nothing to add here yet. Under **Configuration → Domains** you will later add
your deployed URL:

  - `https://<your-project>.vercel.app`  (add this after your first deploy)

> **You do not need to add localhost.** Neon allows development domains
> automatically, on any port.
>
> Trusted domains are the allowlist of URLs Managed Better Auth is willing to
> redirect back to, which is what makes OAuth and email-verification links safe.
> They are not CORS rules. Include the protocol and no trailing slash
> (`https://myapp.com`, not `https://myapp.com/`). Wildcards work for preview
> deployments: `https://*.my-app-preview.vercel.app`.

## 3. Enable the Data API

Console → your project → **Data API**, then enable it.

You get a **Data API URL** shaped like:

```
https://ep-xxxx-yyyy.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1
```

This is PostgREST in front of your database. It is public: anyone with the URL
can send requests to it. That is expected and safe *only because* of the RLS
policies applied in the next step.

## 4. Apply the schema

Console → **SQL Editor**, paste the entire contents of
[`../db/schema.sql`](../db/schema.sql), and run it.

It is written to be re-runnable: `create table if not exists`, `drop policy if
exists` before each `create policy`, and so on.

### Verify it actually took effect

Run this afterwards in the SQL Editor:

```sql
-- Expect: rowsecurity = true, relforcerowsecurity = true
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname = 'contacts';

-- Expect exactly four rows: SELECT, INSERT, UPDATE, DELETE
select polname, cmd, qual, with_check
from pg_policies join pg_policy on polname = policyname
where tablename = 'contacts';

-- Expect: no INSERT/UPDATE grant on the user_id column
select privilege_type, column_name
from information_schema.column_privileges
where table_name = 'contacts' and grantee = 'authenticated'
order by privilege_type, column_name;
```

If `relrowsecurity` is false, the policies exist but are not being enforced -
re-run the `alter table ... enable row level security` line.

## 5. Fill in `.env.local`

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_NEON_AUTH_URL` | Auth page (step 2) |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | Data API page (step 3) |
| `NEON_AUTH_BASE_URL` | Same value as the Auth URL |
| `NEON_AUTH_COOKIE_SECRET` | Generate: `openssl rand -base64 32` |
| `DATABASE_URL` | Connection Details → connection string |

`DATABASE_URL` is only needed if you want to apply the schema with `psql`
instead of the SQL Editor. The application never reads it.

To run the two-account privacy check, also add:

```
RLS_TEST_A_EMAIL=rls-a@example.com
RLS_TEST_A_PASSWORD=<a strong password>
RLS_TEST_B_EMAIL=rls-b@example.com
RLS_TEST_B_PASSWORD=<a different strong password>
```

The script creates these two accounts on first run.

## 6. Run it

```bash
npm run dev      # http://localhost:3000
npm test         # validation + route handler tests
npm run test:rls # two-account privacy proof against the real database
```

## 7. Deploy

After the first Vercel deploy, go back to **step 2** and add
`https://<your-project>.vercel.app` under Auth → Configuration → Domains, then
set the same five variables in Vercel → Settings → Environment Variables.

Skipping the domain step is the classic production-only failure: everything
works on localhost (auto-allowed) and then verification and OAuth redirects
break on the deployed URL.

Only `NEXT_PUBLIC_*` variables reach the browser. `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET` and `DATABASE_URL` must stay server-only.
