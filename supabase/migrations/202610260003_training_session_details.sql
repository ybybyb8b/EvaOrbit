begin;

create or replace function public.valid_training_exercises(items jsonb, progress boolean default false)
returns boolean language plpgsql immutable set search_path=public as $$
declare item jsonb; seen text[] := '{}'; target numeric; done numeric;
begin
  if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>30 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string'
      or (item->>'id') !~ '^[a-zA-Z0-9-]{1,64}$' or (item->>'id')=any(seen)
      or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 120
      or jsonb_typeof(item->'target') is distinct from 'string' or length(item->>'target')>120
      or not (item ? 'sets') then return false; end if;
    target := null;
    if item->'sets'<>'null'::jsonb then
      if jsonb_typeof(item->'sets')<>'number' or (item->>'sets') !~ '^[0-9]+$' then return false; end if;
      target := (item->>'sets')::numeric;
      if target not between 1 and 50 then return false; end if;
    end if;
    if progress then
      if jsonb_typeof(item->'completedSets') is distinct from 'number' or (item->>'completedSets') !~ '^[0-9]+$'
        or jsonb_typeof(item->'completed') is distinct from 'boolean' then return false; end if;
      done := (item->>'completedSets')::numeric;
      if done not between 0 and coalesce(target,0) or (target is not null and (item->>'completed')::boolean is distinct from (done=target)) then return false; end if;
    end if;
    seen := array_append(seen,item->>'id');
  end loop;
  return true;
end $$;

create or replace function public.valid_training_plan_exercises(days jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare day jsonb;
begin
  if jsonb_typeof(days) is distinct from 'array' then return false; end if;
  for day in select value from jsonb_array_elements(days) loop
    if day ? 'exercises' and not public.valid_training_exercises(day->'exercises') then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.valid_training_session_details(session jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare video jsonb; source jsonb;
begin
  if session is null then return true; end if;
  if jsonb_typeof(session) is distinct from 'object' or not public.valid_training_exercises(session->'exercises',true)
    or jsonb_typeof(session->'videos') is distinct from 'array' then return false; end if;
  if jsonb_array_length(session->'videos')>8 or not (session ? 'plan') then return false; end if;
  for video in select value from jsonb_array_elements(session->'videos') loop
    if jsonb_typeof(video->'url') is distinct from 'string' or length(video->>'url')>250 or (video->>'url') !~* '^https?://[^[:space:]/]+'
      or jsonb_typeof(video->'completed') is distinct from 'boolean' then return false; end if;
  end loop;
  source := session->'plan';
  if source<>'null'::jsonb then
    if jsonb_typeof(source) is distinct from 'object'
      or jsonb_typeof(source->'name') is distinct from 'string' or length(btrim(source->>'name')) not between 1 and 120
      or jsonb_typeof(source->'dayName') is distinct from 'string' or length(btrim(source->>'dayName')) not between 1 and 120
      or jsonb_typeof(source->'content') is distinct from 'string' or length(source->>'content')>2500
      or jsonb_typeof(source->'dayNumber') is distinct from 'number' or (source->>'dayNumber') !~ '^[0-9]+$' then return false; end if;
    if (source->>'dayNumber')::numeric not between 1 and 30 then return false; end if;
  end if;
  return true;
end $$;

alter table public.training_logs add column if not exists session_details jsonb;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.training_logs'::regclass and conname='training_logs_session_details_valid') then
    alter table public.training_logs add constraint training_logs_session_details_valid check(public.valid_training_session_details(session_details));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.training_plans'::regclass and conname='training_plans_exercises_valid') then
    alter table public.training_plans add constraint training_plans_exercises_valid check(public.valid_training_plan_exercises(days));
  end if;
end $$;

create or replace function public.complete_training_plan(p_expected_version bigint,p_day_id text,p_request_key uuid,p_log jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_row public.training_plans; saved public.training_logs; day_index integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('training-plan:'||auth.uid()::text,0));
  select * into current_row from public.training_plans where user_id=auth.uid() for update;
  if current_row.user_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  select * into saved from public.training_logs where user_id=auth.uid() and plan_completion_key=p_request_key;
  if saved.id is not null then return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved)); end if;
  if p_request_key is null or p_expected_version is null or p_expected_version<>current_row.version
    or p_day_id is distinct from current_row.current_day_id or current_row.current_day_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  insert into public.training_logs(user_id,occurred_at,occurred_has_explicit_time,training_type,body_parts,teacher,course,duration_minutes,notes,plan_completion_key,session_details)
    values(auth.uid(),(p_log->>'occurredAt')::timestamptz,coalesce((p_log->>'occurredHasExplicitTime')::boolean,false),
      p_log->>'trainingType',p_log->'bodyParts',coalesce(p_log->>'teacher',''),coalesce(p_log->>'course',''),
      (p_log->>'durationMinutes')::integer,coalesce(p_log->>'notes',''),p_request_key,p_log->'sessionDetails') returning * into saved;
  select ordinality::integer-1 into day_index from jsonb_array_elements(current_row.days) with ordinality where value->>'id'=p_day_id;
  update public.training_plans set current_day_id=days->((day_index+1)%jsonb_array_length(days))->>'id',version=version+1,updated_at=now()
    where user_id=auth.uid() returning * into current_row;
  return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved));
end $$;

commit;
