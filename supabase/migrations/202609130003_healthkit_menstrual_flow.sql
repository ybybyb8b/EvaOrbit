begin;

alter table public.menstrual_flow_records add column if not exists ended_at timestamptz;
alter table public.menstrual_flow_records add column if not exists source text not null default 'manual';
alter table public.menstrual_flow_records add column if not exists healthkit_sample_id uuid;
alter table public.menstrual_flow_records add column if not exists healthkit_source_bundle text;
alter table public.menstrual_flow_records add column if not exists healthkit_source_name text;
alter table public.menstrual_flow_records add column if not exists healthkit_sync_identifier text;
alter table public.menstrual_flow_records add column if not exists healthkit_sync_version integer not null default 1;
alter table public.menstrual_flow_records add column if not exists healthkit_sync_status text not null default 'pending';
alter table public.menstrual_flow_records add column if not exists deleted_at timestamptz;

update public.menstrual_flow_records set ended_at=occurred_at where ended_at is null;
update public.menstrual_flow_records set healthkit_sync_identifier='evaorbit.menstrual_flow.' || gen_random_uuid()::text where healthkit_sync_identifier is null;
alter table public.menstrual_flow_records alter column ended_at set not null;
alter table public.menstrual_flow_records add constraint menstrual_flow_records_source_check check(source in ('manual','apple_health'));
alter table public.menstrual_flow_records add constraint menstrual_flow_records_healthkit_sync_version_check check(healthkit_sync_version>=1);
alter table public.menstrual_flow_records add constraint menstrual_flow_records_healthkit_sync_status_check check(healthkit_sync_status in ('pending','synced','pending_delete'));
create unique index if not exists idx_menstrual_flow_healthkit_sample on public.menstrual_flow_records(user_id,healthkit_sample_id) where healthkit_sample_id is not null;
create unique index if not exists idx_menstrual_flow_healthkit_sync on public.menstrual_flow_records(user_id,healthkit_sync_identifier) where healthkit_sync_identifier is not null;
create index if not exists idx_menstrual_flow_healthkit_pending on public.menstrual_flow_records(user_id,healthkit_sync_status,updated_at) where healthkit_sync_status<>'synced';

alter table public.native_devices drop constraint if exists native_devices_scopes_check;
alter table public.native_devices alter column scopes set default array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write']::text[];
update public.native_devices set scopes=array(select distinct unnest(scopes || array['healthkit:menstrual-flow:write']::text[]));
alter table public.native_devices add constraint native_devices_scopes_check check(scopes <@ array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write']::text[]);

create or replace function public.register_native_device(p_installation_id uuid,p_token_hash text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid token hash'; end if;
  insert into public.native_devices(user_id,installation_id,token_hash,scopes,revoked_at)
  values(auth.uid(),p_installation_id,p_token_hash,array['healthkit:energy:write','healthkit:body-mass:write','healthkit:menstrual-flow:write']::text[],null)
  on conflict(user_id,installation_id) do update set token_hash=excluded.token_hash,scopes=excluded.scopes,revoked_at=null,updated_at=timezone('utc',now());
end; $$;

create or replace function public.ingest_healthkit_menstrual_flow_changes(p_user_id uuid,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  change jsonb; operation text; sample_id uuid; sync_id text; incoming_version integer;
  record_id bigint; record_source text; record_version integer; record_deleted_at timestamptz; matched_sample boolean;
  resolved_period_id bigint; local_date date; cycle_start boolean; next_period_start date;
  active_period_id bigint; active_period_start date; accepted integer := 0;
begin
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>100 then raise exception 'Invalid menstrual flow batch'; end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    operation:=change->>'operation';
    if operation not in ('upsert','delete') or (change->>'sampleId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid menstrual flow change'; end if;
    sample_id:=(change->>'sampleId')::uuid;
    if operation='delete' then
      record_id:=null;
      select id,source,deleted_at into record_id,record_source,record_deleted_at from public.menstrual_flow_records where user_id=p_user_id and healthkit_sample_id=sample_id limit 1;
      if record_id is not null then
        if record_source='apple_health' or record_deleted_at is not null then delete from public.menstrual_flow_records where id=record_id and user_id=p_user_id;
        else update public.menstrual_flow_records set healthkit_sample_id=null,healthkit_source_bundle=null,healthkit_source_name=null,healthkit_sync_status='pending' where id=record_id and user_id=p_user_id;
        end if;
        accepted:=accepted+1;
      end if;
      continue;
    end if;

    if (change->>'flow') not in ('none','unspecified','light','medium','heavy') or (change->>'startAt') is null or (change->>'endAt') is null then raise exception 'Invalid menstrual flow sample'; end if;
    sync_id:=nullif(change->>'syncIdentifier',''); incoming_version:=greatest(coalesce((change->>'syncVersion')::integer,1),1);
    cycle_start:=coalesce((change->>'cycleStart')::boolean,false); local_date:=((change->>'startAt')::timestamptz at time zone 'Asia/Shanghai')::date;
    record_id:=null; matched_sample:=false;
    select id,source,healthkit_sync_version,(healthkit_sample_id=sample_id) into record_id,record_source,record_version,matched_sample
      from public.menstrual_flow_records where user_id=p_user_id and ((sync_id is not null and healthkit_sync_identifier=sync_id) or healthkit_sample_id=sample_id)
      order by case when sync_id is not null and healthkit_sync_identifier=sync_id then 0 else 1 end limit 1;

    resolved_period_id:=null;
    if cycle_start then
      select id into resolved_period_id from public.menstrual_periods where user_id=p_user_id and started_on=local_date limit 1;
      if resolved_period_id is null then
        select id,started_on into active_period_id,active_period_start from public.menstrual_periods where user_id=p_user_id and started_on<local_date and (ended_on is null or ended_on>=local_date) order by started_on desc limit 1;
        if active_period_id is not null then update public.menstrual_periods set ended_on=local_date-1 where id=active_period_id and user_id=p_user_id; end if;
        select started_on into next_period_start from public.menstrual_periods where user_id=p_user_id and started_on>local_date order by started_on limit 1;
        insert into public.menstrual_periods(user_id,started_on,ended_on,notes) values(p_user_id,local_date,case when next_period_start is null then null else next_period_start-1 end,'') returning id into resolved_period_id;
      end if;
      if record_id is null then select id,source,healthkit_sync_version into record_id,record_source,record_version from public.menstrual_flow_records where user_id=p_user_id and period_id=resolved_period_id and is_cycle_start limit 1; end if;
    else
      select id into resolved_period_id from public.menstrual_periods where user_id=p_user_id and started_on<=local_date and (ended_on is null or ended_on>=local_date) order by started_on desc limit 1;
    end if;

    if record_id is null then
      insert into public.menstrual_flow_records(user_id,period_id,occurred_at,ended_at,occurred_has_explicit_time,flow,is_cycle_start,notes,source,healthkit_sample_id,healthkit_source_bundle,healthkit_source_name,healthkit_sync_identifier,healthkit_sync_version,healthkit_sync_status)
      values(p_user_id,resolved_period_id,(change->>'startAt')::timestamptz,(change->>'endAt')::timestamptz,true,change->>'flow',cycle_start,'','apple_health',sample_id,left(coalesce(change->>'sourceBundle',''),255),left(coalesce(change->>'sourceName',''),255),sync_id,incoming_version,'synced');
      accepted:=accepted+1;
    elsif matched_sample or incoming_version>=coalesce(record_version,1) then
      update public.menstrual_flow_records set period_id=coalesce(resolved_period_id,menstrual_flow_records.period_id),occurred_at=(change->>'startAt')::timestamptz,ended_at=(change->>'endAt')::timestamptz,flow=change->>'flow',is_cycle_start=cycle_start,healthkit_sample_id=sample_id,healthkit_source_bundle=left(coalesce(change->>'sourceBundle',''),255),healthkit_source_name=left(coalesce(change->>'sourceName',''),255),healthkit_sync_identifier=coalesce(sync_id,healthkit_sync_identifier),healthkit_sync_version=incoming_version,healthkit_sync_status='synced',deleted_at=null where id=record_id and user_id=p_user_id;
      accepted:=accepted+1;
    end if;
  end loop;
  return jsonb_build_object('accepted',accepted,'received',jsonb_array_length(p_changes));
end; $$;

revoke all on function public.ingest_healthkit_menstrual_flow_changes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_menstrual_flow_changes(uuid,jsonb) to service_role;

commit;
