begin;

-- Raw intervals/categories, independent of daily energy and Calendar sleep windows.
-- Installation revisions remain independent across reinstallations/devices.
create table if not exists public.healthkit_read_samples (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  metric text not null check(metric in ('sleep','heart_rate','resting_heart_rate','hrv')),
  sample_id uuid not null,
  revision bigint not null check(revision > 0),
  start_at timestamptz,
  end_at timestamptz,
  time_zone text,
  time_zone_source text check(time_zone_source in ('metadata','device')),
  stage integer,
  quantity_value double precision,
  quantity_unit text,
  source_bundle text,
  source_name text,
  sync_identifier text,
  sync_version integer check(sync_version > 0),
  deleted boolean not null default false,
  ingested_at timestamptz not null default now(),
  primary key(user_id,metric,sample_id),
  check(deleted or (start_at is not null and end_at is not null and end_at >= start_at and time_zone is not null and time_zone_source is not null)),
  check(deleted or (metric='sleep' and stage is not null and stage between 0 and 100 and end_at > start_at and quantity_value is null and quantity_unit is null)
    or (metric in ('heart_rate','resting_heart_rate') and stage is null and quantity_value is not null and quantity_unit is not null and quantity_value between 0 and 1000 and quantity_unit='count/min')
    or (metric='hrv' and stage is null and quantity_value is not null and quantity_unit is not null and quantity_value between 0 and 10000 and quantity_unit='ms'))
);
create table if not exists public.healthkit_read_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null, stream_id uuid not null, metric text not null, sample_id uuid not null, revision bigint not null check(revision>0),
  primary key(user_id,installation_id,stream_id,metric,sample_id)
);
alter table public.healthkit_read_receipts enable row level security;
revoke all on public.healthkit_read_receipts from public,anon,authenticated;
grant select,insert,update on public.healthkit_read_receipts to service_role;
create index if not exists idx_healthkit_read_intervals on public.healthkit_read_samples(user_id,metric,end_at,start_at) where not deleted;
alter table public.healthkit_read_samples enable row level security;
drop policy if exists healthkit_read_samples_owner_select on public.healthkit_read_samples;
create policy healthkit_read_samples_owner_select on public.healthkit_read_samples
  for select to authenticated using((select auth.uid())=user_id);
revoke all on public.healthkit_read_samples from public,anon,authenticated;
grant select on public.healthkit_read_samples to authenticated;
grant select,insert,update on public.healthkit_read_samples to service_role;

alter table public.native_devices drop constraint if exists native_devices_scopes_check;
alter table public.native_devices alter column scopes set default array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write','healthkit:read-samples:write']::text[];
update public.native_devices set scopes=array(select distinct unnest(scopes || array['healthkit:read-samples:write']::text[]));
alter table public.native_devices add constraint native_devices_scopes_check
  check(scopes <@ array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write','healthkit:read-samples:write']::text[]);

create or replace function public.register_native_device(p_installation_id uuid,p_token_hash text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid token hash'; end if;
  insert into public.native_devices(user_id,installation_id,token_hash,scopes,revoked_at)
  values(auth.uid(),p_installation_id,p_token_hash,array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write','healthkit:read-samples:write']::text[],null)
  on conflict(user_id,installation_id) do update set token_hash=excluded.token_hash,scopes=excluded.scopes,revoked_at=null,updated_at=now();
end; $$;

create or replace function public.ingest_healthkit_read_changes(p_user_id uuid,p_installation_id uuid,p_changes jsonb,p_enabled_metrics text[] default array['sleep']::text[])
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare change jsonb; incoming_metric text; incoming_operation text; changed integer; accepted integer:=0;
begin
  if p_user_id is null or p_installation_id is null or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes)>100 then raise exception 'Invalid read sample batch'; end if;
  if p_enabled_metrics is null or not(p_enabled_metrics <@ array['sleep','heart_rate','resting_heart_rate','hrv']::text[]) then raise exception 'Invalid sync policy'; end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    incoming_metric:=change->>'metric'; incoming_operation:=change->>'operation';
    if incoming_metric is null or not(incoming_metric=any(p_enabled_metrics)) then raise exception 'Read metric sync disabled'; end if;
    if incoming_operation is null or incoming_operation not in ('upsert','delete')
      or change->>'sampleId' is null or change->>'streamId' is null or change->>'revision' is null then raise exception 'Invalid read sample change'; end if;
    if incoming_operation='upsert' and (change->>'startAt' is null or change->>'endAt' is null
      or not exists(select 1 from pg_timezone_names where name=change->>'timeZone')) then raise exception 'Invalid read sample interval'; end if;
    insert into public.healthkit_read_receipts(user_id,installation_id,stream_id,metric,sample_id,revision)
    values(p_user_id,p_installation_id,(change->>'streamId')::uuid,incoming_metric,(change->>'sampleId')::uuid,(change->>'revision')::bigint)
    on conflict(user_id,installation_id,stream_id,metric,sample_id) do update set revision=excluded.revision
      where excluded.revision > public.healthkit_read_receipts.revision;
    get diagnostics changed=row_count;
    if changed=0 then continue; end if;
    insert into public.healthkit_read_samples(user_id,installation_id,metric,sample_id,revision,start_at,end_at,time_zone,time_zone_source,
      stage,quantity_value,quantity_unit,source_bundle,source_name,sync_identifier,sync_version,deleted)
    values(p_user_id,p_installation_id,incoming_metric,(change->>'sampleId')::uuid,(change->>'revision')::bigint,
      case when incoming_operation='upsert' then (change->>'startAt')::timestamptz end,
      case when incoming_operation='upsert' then (change->>'endAt')::timestamptz end,
      case when incoming_operation='upsert' then change->>'timeZone' end,
      case when incoming_operation='upsert' then change->>'timeZoneSource' end,
      case when incoming_operation='upsert' then (change->>'stage')::integer end,
      case when incoming_operation='upsert' then (change->>'value')::double precision end,
      case when incoming_operation='upsert' then change->>'unit' end,
      left(change->>'sourceBundle',255),left(change->>'sourceName',255),left(change->>'syncIdentifier',255),(change->>'syncVersion')::integer,incoming_operation='delete')
    on conflict(user_id,metric,sample_id) do update set
      installation_id=excluded.installation_id,
      revision=excluded.revision,start_at=excluded.start_at,end_at=excluded.end_at,time_zone=excluded.time_zone,time_zone_source=excluded.time_zone_source,
      stage=excluded.stage,quantity_value=excluded.quantity_value,quantity_unit=excluded.quantity_unit,
      source_bundle=excluded.source_bundle,source_name=excluded.source_name,sync_identifier=excluded.sync_identifier,sync_version=excluded.sync_version,
      deleted=excluded.deleted,ingested_at=now()
    -- A deleted HealthKit UUID cannot become live again. Reinstall rescan cannot resurrect it.
    where not public.healthkit_read_samples.deleted or excluded.deleted;
    get diagnostics changed=row_count; accepted:=accepted+changed;
  end loop;
  return jsonb_build_object('accepted',accepted,'received',jsonb_array_length(p_changes));
end; $$;
revoke all on function public.ingest_healthkit_read_changes(uuid,uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_read_changes(uuid,uuid,jsonb,text[]) to service_role;

commit;
