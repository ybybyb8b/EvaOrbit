begin;

alter table public.training_logs add column if not exists training_content text not null default '';
alter table public.training_logs add column if not exists workout_sample_id uuid;
alter table public.training_logs add column if not exists workout jsonb;
alter table public.training_logs add column if not exists workout_deleted boolean not null default false;
alter table public.training_logs add column if not exists details_completed_at timestamptz;
create unique index if not exists training_logs_workout_identity on public.training_logs(user_id,workout_sample_id) where workout_sample_id is not null;

-- UUID deletion is permanent, including when deletion arrives before discovery on another device.
create table if not exists public.healthkit_workout_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  sample_id uuid not null,
  primary key(user_id,sample_id)
);
alter table public.healthkit_workout_tombstones enable row level security;
revoke all on public.healthkit_workout_tombstones from public,anon,authenticated;
grant select,insert on public.healthkit_workout_tombstones to service_role;
grant select,insert,update on public.training_logs to service_role;
grant usage,select on sequence public.training_logs_id_seq to service_role;

-- Enforce the source boundary even for direct PostgREST/MCP callers.
create or replace function public.protect_training_workout() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') then
    if TG_OP='DELETE' then
      if old.workout_sample_id is not null then raise exception 'Delete this workout in Apple Health'; end if;
      return old;
    end if;
    if TG_OP='INSERT' then
      if new.workout_sample_id is not null or new.workout is not null or new.workout_deleted or new.details_completed_at is not null then raise exception 'Workout source is read only'; end if;
    elsif old.workout_sample_id is not null then
      if old.workout_deleted then raise exception 'Workout was deleted in Apple Health'; end if;
      if (new.workout_sample_id,new.workout,new.workout_deleted,new.occurred_at,new.occurred_has_explicit_time,new.training_type,new.duration_minutes)
        is distinct from (old.workout_sample_id,old.workout,old.workout_deleted,old.occurred_at,old.occurred_has_explicit_time,old.training_type,old.duration_minutes)
        then raise exception 'Workout source is read only'; end if;
      new.details_completed_at=now();
    elsif new.workout_sample_id is not null or new.workout is not null or new.workout_deleted then
      raise exception 'Workout source is read only';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists protect_training_workout on public.training_logs;
create trigger protect_training_workout before insert or update or delete on public.training_logs for each row execute function public.protect_training_workout();

-- Preserve the existing sleep/heart ingest implementation and its security policy.
do $$ begin
  if to_regprocedure('public.ingest_healthkit_nonworkout_changes(uuid,uuid,jsonb,text[])') is null then
    alter function public.ingest_healthkit_read_changes(uuid,uuid,jsonb,text[]) rename to ingest_healthkit_nonworkout_changes;
  end if;
end $$;
revoke all on function public.ingest_healthkit_nonworkout_changes(uuid,uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_nonworkout_changes(uuid,uuid,jsonb,text[]) to service_role;

create or replace function public.ingest_healthkit_read_changes(p_user_id uuid,p_installation_id uuid,p_changes jsonb,p_enabled_metrics text[] default array['sleep','workout']::text[])
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb; facts jsonb; other_changes jsonb; other_result jsonb; changed integer; accepted integer:=0;
begin
  if p_user_id is null or p_installation_id is null or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>100 then raise exception 'Invalid read sample batch'; end if;
  if p_enabled_metrics is null or not(p_enabled_metrics <@ array['sleep','workout','heart_rate','resting_heart_rate','hrv']::text[]) then raise exception 'Invalid sync policy'; end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into other_changes from jsonb_array_elements(p_changes) where value->>'metric' is distinct from 'workout';
  select public.ingest_healthkit_nonworkout_changes(p_user_id,p_installation_id,other_changes,array_remove(p_enabled_metrics,'workout')) into other_result;
  accepted=coalesce((other_result->>'accepted')::integer,0);
  for c in select value from jsonb_array_elements(p_changes) where value->>'metric'='workout' loop
    if not('workout'=any(p_enabled_metrics)) then raise exception 'Read metric sync disabled'; end if;
    if c->>'operation' is null or c->>'operation' not in ('upsert','delete') or c->>'sampleId' is null or c->>'streamId' is null or coalesce((c->>'revision')::bigint,0)<1 then raise exception 'Invalid workout change'; end if;
    -- Serialize all streams/devices for an account UUID, including delete-before-insert.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || (c->>'sampleId'),0));
    insert into public.healthkit_read_receipts(user_id,installation_id,stream_id,metric,sample_id,revision)
      values(p_user_id,p_installation_id,(c->>'streamId')::uuid,'workout',(c->>'sampleId')::uuid,(c->>'revision')::bigint)
      on conflict(user_id,installation_id,stream_id,metric,sample_id) do update set revision=excluded.revision where excluded.revision>public.healthkit_read_receipts.revision;
    get diagnostics changed=row_count;
    if changed=0 then continue; end if;
    if c->>'operation'='delete' then
      insert into public.healthkit_workout_tombstones values(p_user_id,(c->>'sampleId')::uuid) on conflict do nothing;
      update public.training_logs set workout_deleted=true where user_id=p_user_id and workout_sample_id=(c->>'sampleId')::uuid;
      accepted=accepted+1;
      continue;
    end if;
    if exists(select 1 from public.healthkit_workout_tombstones where user_id=p_user_id and sample_id=(c->>'sampleId')::uuid) then continue; end if;
    facts=c->'workout';
    if jsonb_typeof(facts) is distinct from 'object' or coalesce((facts->>'activityType')::integer,0)<1 or coalesce((facts->>'durationSeconds')::double precision,-1)<0
      or c->>'startAt' is null or c->>'endAt' is null or (c->>'endAt')::timestamptz<(c->>'startAt')::timestamptz
      or c->>'timeZoneSource' not in ('metadata','device') or not exists(select 1 from pg_timezone_names where name=c->>'timeZone')
      or coalesce((facts->>'activeEnergyKcal')::double precision,0)<0 or coalesce((facts->>'distance')::double precision,0)<0
      or (facts ? 'distance' and (facts->>'distanceUnit' is distinct from 'm')) then raise exception 'Invalid workout facts'; end if;
    insert into public.training_logs(user_id,occurred_at,occurred_has_explicit_time,training_type,duration_minutes,workout_sample_id,workout)
      values(p_user_id,(c->>'startAt')::timestamptz,true,
        case when facts->>'activityName' in ('functionalStrengthTraining','traditionalStrengthTraining','coreTraining') then 'strength'
          when facts->>'activityName' in ('cycling','hiking','rowing','running','swimming','walking','elliptical','stairClimbing','mixedCardio') then 'cardio' else 'mixed' end,
        greatest(1,round((facts->>'durationSeconds')::numeric/60)::integer),(c->>'sampleId')::uuid,c)
      on conflict(user_id,workout_sample_id) where workout_sample_id is not null do update set
        occurred_at=excluded.occurred_at,occurred_has_explicit_time=true,training_type=excluded.training_type,duration_minutes=excluded.duration_minutes,workout=excluded.workout;
    accepted=accepted+1;
  end loop;
  return jsonb_build_object('accepted',accepted,'received',jsonb_array_length(p_changes));
end; $$;
revoke all on function public.ingest_healthkit_read_changes(uuid,uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_read_changes(uuid,uuid,jsonb,text[]) to service_role;

create or replace function public.complete_training_plan(p_expected_version bigint,p_day_id text,p_request_key uuid,p_log jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_row public.training_plans; saved public.training_logs; day_index integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('training-plan:'||auth.uid()::text,0));
  select * into current_row from public.training_plans where user_id=auth.uid() for update;
  if current_row.user_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  select * into saved from public.training_logs where user_id=auth.uid() and plan_completion_key=p_request_key;
  if saved.id is not null then return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved)); end if;
  if p_request_key is null or p_expected_version is null or p_expected_version<>current_row.version or p_day_id is distinct from current_row.current_day_id or current_row.current_day_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  insert into public.training_logs(user_id,occurred_at,occurred_has_explicit_time,training_type,body_parts,teacher,course,duration_minutes,notes,plan_completion_key,session_details,training_content)
    values(auth.uid(),(p_log->>'occurredAt')::timestamptz,coalesce((p_log->>'occurredHasExplicitTime')::boolean,false),
      p_log->>'trainingType',p_log->'bodyParts',coalesce(p_log->>'teacher',''),coalesce(p_log->>'course',''),
      (p_log->>'durationMinutes')::integer,coalesce(p_log->>'notes',''),p_request_key,p_log->'sessionDetails',coalesce(p_log->>'trainingContent','')) returning * into saved;
  select ordinality::integer-1 into day_index from jsonb_array_elements(current_row.days) with ordinality where value->>'id'=p_day_id;
  update public.training_plans set current_day_id=days->((day_index+1)%jsonb_array_length(days))->>'id',version=version+1,updated_at=now() where user_id=auth.uid() returning * into current_row;
  return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved));
end $$;

commit;
