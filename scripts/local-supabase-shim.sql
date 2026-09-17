-- Objects Supabase already provides, recreated so migrations can be applied to
-- a plain PostgreSQL instance for testing. Never run this against Supabase.

-- Idempotent: the roles are cluster-wide, so a second run must not fail.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Supabase grants these to the API roles on everything in `public`, leaving RLS
-- as the only gate. Without it the test would fail on a missing GRANT and never
-- reach a policy.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
