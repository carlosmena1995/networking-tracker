-- Networking Tracker - schema, constraints and Row Level Security.
-- Run this once in the Neon SQL Editor (or via psql with DATABASE_URL).
--
-- Security model in one line:
--   GRANTs decide which TABLES and COLUMNS a caller may touch;
--   RLS policies decide WHICH ROWS; CHECK constraints decide which VALUES.
--
-- This matters because the Neon Data API is reachable from the public internet
-- with the same URL the browser uses. Anything enforced only in React or only
-- in a Next.js route handler can be bypassed with curl, so every rule that
-- actually protects data lives here.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists contacts (
  id         uuid        primary key default gen_random_uuid(),

  -- Ownership column. auth.user_id() returns the `sub` claim of the caller's
  -- JWT as text. Because it is the DEFAULT, a client never needs to send
  -- user_id - and because of the column grants below, it may not send one.
  user_id    text        not null default auth.user_id(),

  name       text        not null check (length(btrim(name)) > 0),
  company    text        check (company is null or length(company) <= 200),
  role       text        check (role is null or length(role) <= 200),
  met_at     text        check (met_at is null or length(met_at) <= 200),
  notes      text        check (notes is null or length(notes) <= 2000),

  -- The only three values the assignment allows.
  priority   text        not null check (priority in ('high', 'medium', 'low')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contacts_name_length check (length(name) <= 200)
);

-- Every query is "my contacts, newest first", so index for exactly that.
create index if not exists contacts_user_id_created_at_idx
  on contacts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Keep updated_at honest (a client cannot forge it)
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Belt and braces: never let an UPDATE move a row to another owner, even if
  -- a policy were later loosened by mistake.
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table contacts enable row level security;

-- Force RLS so it applies even to the table owner. Without this, a superuser
-- style connection would silently bypass every policy below.
alter table contacts force row level security;

drop policy if exists contacts_select_own on contacts;
drop policy if exists contacts_insert_own on contacts;
drop policy if exists contacts_update_own on contacts;
drop policy if exists contacts_delete_own on contacts;

-- Four separate policies, one per verb, each scoped to the `authenticated`
-- role and each restricted to rows the caller owns.

-- SELECT: you can only read rows whose user_id is your own JWT subject.
create policy contacts_select_own on contacts
  as permissive for select to authenticated
  using (auth.user_id() = user_id);

-- INSERT: you may only create rows that will belong to you. WITH CHECK runs
-- against the NEW row, after the user_id default has been applied.
create policy contacts_insert_own on contacts
  as permissive for insert to authenticated
  with check (auth.user_id() = user_id);

-- UPDATE: USING picks which existing rows you may target (only yours);
-- WITH CHECK re-validates the row AFTER your change, which is what stops you
-- rewriting user_id to hand a row to somebody else. Both clauses are required:
-- USING alone would let you edit your row into someone else's.
create policy contacts_update_own on contacts
  as permissive for update to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- DELETE: you may only delete your own rows.
create policy contacts_delete_own on contacts
  as permissive for delete to authenticated
  using (auth.user_id() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Grants (which tables/columns the Data API may touch at all)
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select on contacts to authenticated;
grant delete on contacts to authenticated;

-- Column-level grants: id, user_id, created_at and updated_at are deliberately
-- absent, so a caller cannot supply or alter them even before RLS is consulted.
grant insert (name, company, role, met_at, notes, priority) on contacts to authenticated;
grant update (name, company, role, met_at, notes, priority) on contacts to authenticated;

-- Signed-out callers get nothing at all. The `anonymous` role only exists once
-- the Data API is enabled, so guard the revoke.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anonymous') then
    revoke all on contacts from anonymous;
  end if;
end;
$$;
