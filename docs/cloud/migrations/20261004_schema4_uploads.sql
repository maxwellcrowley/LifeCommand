-- Apply in the Supabase SQL Editor. This replaces only the RPC implementation;
-- it does not update, delete, or rewrite any cloud_snapshots rows.
begin;
create or replace function public.write_cloud_snapshot(
  p_user_id uuid, p_payload jsonb, p_schema_version integer, p_expected_revision bigint
) returns public.cloud_snapshots
language plpgsql security definer set search_path = '' as $$
declare result public.cloud_snapshots;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;
  if p_schema_version not in (1, 2, 3, 4) then
    raise exception 'Unsupported snapshot schema version' using errcode = '22023';
  end if;
  if p_payload is null
    or p_payload ->> 'format' is distinct from 'lifecommand-export'
    or p_payload ->> 'schemaVersion' is distinct from p_schema_version::text
    or jsonb_typeof(p_payload -> 'exportedAt') is distinct from 'string'
    or jsonb_typeof(p_payload -> 'data') is distinct from 'object' then
    raise exception 'Malformed snapshot envelope' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 10485760 then
    raise exception 'Snapshot payload exceeds 10 MiB' using errcode = '22023';
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
