-- Run in the Supabase SQL Editor. Re-running preserves existing snapshots.
begin;
create table if not exists public.cloud_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null check (revision > 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint snapshot_envelope check (coalesce(
    jsonb_typeof(payload) = 'object'
    and payload ->> 'format' = 'lifecommand-export'
    and (payload ->> 'schemaVersion')::integer = schema_version
    and jsonb_typeof(payload -> 'data') = 'object', false)
  )
);
alter table public.cloud_snapshots enable row level security;
drop policy if exists snapshots_read_own on public.cloud_snapshots;
create policy snapshots_read_own on public.cloud_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists snapshots_insert_own on public.cloud_snapshots;
create policy snapshots_insert_own on public.cloud_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists snapshots_update_own on public.cloud_snapshots;
create policy snapshots_update_own on public.cloud_snapshots for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- App writes only through the atomic compare-and-swap function, never direct DML.
revoke all on public.cloud_snapshots from public, anon, authenticated;
grant select on public.cloud_snapshots to authenticated;
create or replace function public.write_cloud_snapshot(
  p_user_id uuid, p_payload jsonb, p_schema_version integer, p_expected_revision bigint
) returns public.cloud_snapshots
language plpgsql security definer set search_path = '' as $$
declare result public.cloud_snapshots;
begin
  -- SECURITY DEFINER bypasses RLS: explicitly bind every operation to auth.uid().
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;
  if p_schema_version is distinct from 3 or p_payload is null
    or p_payload ->> 'format' is distinct from 'lifecommand-export'
    or p_payload ->> 'schemaVersion' is distinct from '3'
    or jsonb_typeof(p_payload -> 'data') is distinct from 'object'
    or octet_length(p_payload::text) > 10485760 then
    raise exception 'Invalid snapshot envelope or exceeds 10 MB' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.cloud_snapshots (user_id, payload, schema_version, revision, updated_at)
      values (auth.uid(), p_payload, p_schema_version, 1, clock_timestamp())
      on conflict (user_id) do nothing returning * into result;
  else
    update public.cloud_snapshots set payload = p_payload, schema_version = p_schema_version,
      revision = revision + 1, updated_at = clock_timestamp()
      where user_id = auth.uid() and revision = p_expected_revision
      returning * into result;
  end if;
  if result.user_id is null then
    raise exception 'Cloud revision changed; preview again' using errcode = '40001';
  end if;
  return result;
end;
$$;
revoke all on function public.write_cloud_snapshot(uuid, jsonb, integer, bigint) from public, anon;
grant execute on function public.write_cloud_snapshot(uuid, jsonb, integer, bigint) to authenticated;
commit;
