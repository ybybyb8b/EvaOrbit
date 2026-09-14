begin;

create or replace function public.reconcile_healthkit_menstrual_periods(p_user_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  episode record;
  resolved_period_id bigint;
begin
  -- A later cycle starts a new period. Close the previous period on its last
  -- recorded flow day, never on the day before the next cycle.
  with bounds as (
    select p.id,max((f.occurred_at at time zone 'Asia/Shanghai')::date) as last_flow_on
    from public.menstrual_periods p
    join public.menstrual_flow_records f on f.user_id=p.user_id and f.period_id=p.id
    where p.user_id=p_user_id and f.deleted_at is null and f.flow<>'none'
      and exists (
        select 1 from public.menstrual_periods later
        where later.user_id=p.user_id and later.started_on>p.started_on
      )
    group by p.id
  )
  update public.menstrual_periods p
  set ended_on=b.last_flow_on
  from bounds b
  where p.id=b.id and p.user_id=p_user_id and p.ended_on is distinct from b.last_flow_on;

  -- Apple Health does not guarantee cycle-start metadata on historical samples.
  -- Conservatively turn consecutive, positive, unassociated flow days into a
  -- closed period so Calendar can render the confirmed range.
  for episode in
    with flow_days as (
      select distinct (f.occurred_at at time zone 'Asia/Shanghai')::date as flow_on
      from public.menstrual_flow_records f
      where f.user_id=p_user_id and f.source='apple_health' and f.deleted_at is null
        and f.flow<>'none' and f.period_id is null
    ), numbered as (
      select flow_on,flow_on-(row_number() over(order by flow_on))::integer as island
      from flow_days
    )
    select min(flow_on) as started_on,max(flow_on) as ended_on
    from numbered group by island order by min(flow_on)
  loop
    resolved_period_id:=null;
    select p.id into resolved_period_id
    from public.menstrual_periods p
    where p.user_id=p_user_id and (
      p.started_on between episode.started_on-1 and episode.ended_on+1
      or p.ended_on between episode.started_on-1 and episode.ended_on+1
    )
    order by
      case when p.started_on<=episode.ended_on and coalesce(p.ended_on,p.started_on)>=episode.started_on then 0 else 1 end,
      abs(p.started_on-episode.started_on),p.id
    limit 1;

    if resolved_period_id is null then
      insert into public.menstrual_periods(user_id,started_on,ended_on,notes)
      values(p_user_id,episode.started_on,episode.ended_on,'') returning id into resolved_period_id;
    else
      update public.menstrual_periods
      set started_on=least(started_on,episode.started_on),
          ended_on=case when ended_on is null then null else greatest(ended_on,episode.ended_on) end
      where id=resolved_period_id and user_id=p_user_id;
    end if;

    update public.menstrual_flow_records
    set period_id=resolved_period_id
    where user_id=p_user_id and source='apple_health' and deleted_at is null
      and flow<>'none' and period_id is null
      and (occurred_at at time zone 'Asia/Shanghai')::date between episode.started_on and episode.ended_on;
  end loop;
end; $$;

create or replace function public.ingest_healthkit_menstrual_flow_changes(p_user_id uuid,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  change jsonb; operation text; sample_id uuid; sync_id text; incoming_version integer;
  record_id bigint; record_source text; record_version integer; record_deleted_at timestamptz; matched_sample boolean;
  resolved_period_id bigint; local_date date; cycle_start boolean; next_period_start date;
  active_period_id bigint; accepted integer := 0;
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
        select id into active_period_id from public.menstrual_periods where user_id=p_user_id and started_on<local_date and (ended_on is null or ended_on>=local_date) order by started_on desc limit 1;
        if active_period_id is not null then
          update public.menstrual_periods p set ended_on=coalesce((
            select max((f.occurred_at at time zone 'Asia/Shanghai')::date)
            from public.menstrual_flow_records f
            where f.user_id=p_user_id and f.period_id=p.id and f.deleted_at is null and f.flow<>'none'
          ),p.started_on) where p.id=active_period_id and p.user_id=p_user_id;
        end if;
        select started_on into next_period_start from public.menstrual_periods where user_id=p_user_id and started_on>local_date order by started_on limit 1;
        insert into public.menstrual_periods(user_id,started_on,ended_on,notes)
        values(p_user_id,local_date,case when next_period_start is null then null else local_date end,'') returning id into resolved_period_id;
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
  perform public.reconcile_healthkit_menstrual_periods(p_user_id);
  return jsonb_build_object('accepted',accepted,'received',jsonb_array_length(p_changes));
end; $$;

do $$
declare owner record;
begin
  for owner in select distinct user_id from public.menstrual_flow_records where source='apple_health' loop
    perform public.reconcile_healthkit_menstrual_periods(owner.user_id);
  end loop;
end; $$;

revoke all on function public.reconcile_healthkit_menstrual_periods(uuid) from public,anon,authenticated;
revoke all on function public.ingest_healthkit_menstrual_flow_changes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_menstrual_flow_changes(uuid,jsonb) to service_role;

commit;
