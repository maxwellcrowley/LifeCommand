-- Additive. Apply as database administrator; no changes to cloud_snapshots.
begin;
do $$ begin
  if not exists (select from pg_roles where rolname = 'live_ics_backend') then
    create role live_ics_backend nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
create schema if not exists live_ics_private;
revoke all on schema live_ics_private from public, anon, authenticated;
grant usage on schema live_ics_private, public to live_ics_backend;
create table public.live_ics_connections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, name text not null check (length(name) between 1 and 80),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'), visible boolean not null default true,
  hostname text, ready boolean not null default false,
  generation uuid not null, revision integer not null default 1,
  last_attempt timestamptz, last_success timestamptz, next_attempt timestamptz,
  error text, failures integer not null default 0,
  coverage jsonb, events jsonb, lease uuid, lease_until timestamptz,
  primary key (owner_id, id),
  check (not ready or (events is not null and coverage is not null and last_success is not null))
);
alter table public.live_ics_connections enable row level security;
create policy live_ics_read on public.live_ics_connections for select to authenticated
  using (owner_id = (select auth.uid()) and ready);
create policy live_ics_server on public.live_ics_connections to live_ics_backend using (true) with check (true);
revoke all on public.live_ics_connections from public, anon, authenticated;
-- Only safe published fields. Coordination/internal error counters are not exposed.
grant select (owner_id,id,name,color,visible,hostname,revision,last_attempt,last_success,error,coverage,events,ready)
  on public.live_ics_connections to authenticated;
grant select,insert,update,delete on public.live_ics_connections to live_ics_backend;
create table live_ics_private.secrets (
  owner_id uuid not null, id uuid not null, secret jsonb not null,
  etag text, modified text,
  primary key (owner_id,id), foreign key (owner_id,id) references public.live_ics_connections on delete cascade
);
create table live_ics_private.deleted (
  owner_id uuid not null references auth.users(id) on delete cascade, id uuid not null,
  primary key(owner_id,id)
);
create table live_ics_private.budgets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(), requests integer not null default 0,
  fetch_start timestamptz not null default now(), fetches integer not null default 0
);
create table live_ics_private.slots (id integer primary key, lease uuid, lease_until timestamptz);
insert into live_ics_private.slots(id) select generate_series(1,16);
revoke all on all tables in schema live_ics_private from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema live_ics_private to live_ics_backend;
-- Secrets are private-schema only, with defense-in-depth policies for server role.
alter table live_ics_private.secrets enable row level security;
create policy secrets_server on live_ics_private.secrets to live_ics_backend using (true) with check (true);
commit;
