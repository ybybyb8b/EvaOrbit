begin;

create table if not exists public.native_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['healthkit:energy:write']::text[],
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, installation_id),
  check (scopes <@ array['healthkit:energy:write']::text[])
);

create table if not exists public.healthkit_daily_energy (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  resting_energy_kcal double precision,
  resting_revision bigint not null default 0,
  resting_sample_count integer,
  resting_calculated_at timestamptz,
  active_energy_kcal double precision,
  active_revision bigint not null default 0,
  active_sample_count integer,
  active_calculated_at timestamptz,
  source text not null default 'apple_health' check (source = 'apple_health'),
  last_ingested_at timestamptz not null default timezone('utc', now()),
  primary key(user_id, local_date),
  check (resting_energy_kcal is null or resting_energy_kcal between 0 and 50000),
  check (active_energy_kcal is null or active_energy_kcal between 0 and 50000),
  check (resting_sample_count is null or resting_sample_count between 0 and 1000000),
  check (active_sample_count is null or active_sample_count between 0 and 1000000)
);

drop trigger if exists native_devices_set_updated_at on public.native_devices;
create trigger native_devices_set_updated_at before update on public.native_devices
for each row execute function public.set_updated_at();

alter table public.native_devices enable row level security;
alter table public.healthkit_daily_energy enable row level security;

drop policy if exists healthkit_daily_energy_owner_select on public.healthkit_daily_energy;
create policy healthkit_daily_energy_owner_select on public.healthkit_daily_energy
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.native_devices, public.healthkit_daily_energy from public, anon, authenticated;
grant select on table public.healthkit_daily_energy to authenticated;
grant select, insert, update on table public.native_devices to service_role;
grant select, insert, update on table public.healthkit_daily_energy to service_role;

create or replace function public.register_native_device(p_installation_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token hash';
  end if;

  insert into public.native_devices(user_id, installation_id, token_hash, scopes, revoked_at)
  values(auth.uid(), p_installation_id, p_token_hash, array['healthkit:energy:write']::text[], null)
  on conflict(user_id, installation_id) do update set
    token_hash = excluded.token_hash,
    scopes = excluded.scopes,
    revoked_at = null,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.revoke_native_device(p_installation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  update public.native_devices
    set revoked_at = timezone('utc', now())
    where user_id = auth.uid() and installation_id = p_installation_id;
end;
$$;

create or replace function public.ingest_healthkit_energy_snapshots(p_user_id uuid, p_snapshots jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  snapshot jsonb;
  metric text;
  changed integer;
  accepted integer := 0;
begin
  if jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) < 1 or jsonb_array_length(p_snapshots) > 50 then
    raise exception 'Invalid snapshot batch';
  end if;

  for snapshot in select value from jsonb_array_elements(p_snapshots)
  loop
    metric := snapshot->>'metric';
    if metric is null
      or metric not in ('resting', 'active')
      or (snapshot->>'localDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (snapshot->>'revision')::bigint < 1
      or (snapshot->>'sampleCount')::integer not between 0 and 1000000
      or (snapshot->>'kcal')::double precision not between 0 and 50000 then
      raise exception 'Invalid energy snapshot';
    end if;

    if metric = 'resting' then
      insert into public.healthkit_daily_energy(
        user_id, local_date, resting_energy_kcal, resting_revision,
        resting_sample_count, resting_calculated_at, last_ingested_at
      ) values (
        p_user_id, (snapshot->>'localDate')::date, (snapshot->>'kcal')::double precision,
        (snapshot->>'revision')::bigint, (snapshot->>'sampleCount')::integer,
        (snapshot->>'calculatedAt')::timestamptz, timezone('utc', now())
      )
      on conflict(user_id, local_date) do update set
        resting_energy_kcal = excluded.resting_energy_kcal,
        resting_revision = excluded.resting_revision,
        resting_sample_count = excluded.resting_sample_count,
        resting_calculated_at = excluded.resting_calculated_at,
        last_ingested_at = excluded.last_ingested_at
      where excluded.resting_revision > public.healthkit_daily_energy.resting_revision;
    else
      insert into public.healthkit_daily_energy(
        user_id, local_date, active_energy_kcal, active_revision,
        active_sample_count, active_calculated_at, last_ingested_at
      ) values (
        p_user_id, (snapshot->>'localDate')::date, (snapshot->>'kcal')::double precision,
        (snapshot->>'revision')::bigint, (snapshot->>'sampleCount')::integer,
        (snapshot->>'calculatedAt')::timestamptz, timezone('utc', now())
      )
      on conflict(user_id, local_date) do update set
        active_energy_kcal = excluded.active_energy_kcal,
        active_revision = excluded.active_revision,
        active_sample_count = excluded.active_sample_count,
        active_calculated_at = excluded.active_calculated_at,
        last_ingested_at = excluded.last_ingested_at
      where excluded.active_revision > public.healthkit_daily_energy.active_revision;
    end if;
    get diagnostics changed = row_count;
    accepted := accepted + changed;
  end loop;

  return jsonb_build_object('accepted', accepted, 'received', jsonb_array_length(p_snapshots));
end;
$$;

revoke all on function public.register_native_device(uuid, text) from public, anon;
revoke all on function public.revoke_native_device(uuid) from public, anon;
revoke all on function public.ingest_healthkit_energy_snapshots(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_native_device(uuid, text) to authenticated;
grant execute on function public.revoke_native_device(uuid) to authenticated;
grant execute on function public.ingest_healthkit_energy_snapshots(uuid, jsonb) to service_role;

commit;
