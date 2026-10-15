begin;

create or replace function public.valid_training_plan_days(p_days jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare d jsonb; u jsonb; seen text[] := '{}';
begin
  if p_days is null or jsonb_typeof(p_days)<>'array' or jsonb_array_length(p_days)>30 then return false; end if;
  for d in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(d)<>'object' or jsonb_typeof(d->'id') is distinct from 'string'
      or (d->>'id') !~ '^[a-zA-Z0-9-]{1,64}$' or (d->>'id')=any(seen)
      or jsonb_typeof(d->'name') is distinct from 'string' or length(btrim(d->>'name')) not between 1 and 120
      or coalesce(d->>'trainingType','') not in ('cardio','strength','mixed')
      or jsonb_typeof(d->'bodyParts') is distinct from 'array'
      or jsonb_typeof(d->'content') is distinct from 'string' or length(d->>'content')>2500
      or jsonb_typeof(d->'videoUrls') is distinct from 'array' then return false; end if;
    if jsonb_array_length(d->'bodyParts')=0 or exists(select 1 from jsonb_array_elements(d->'bodyParts') b where jsonb_typeof(b)<>'string' or b #>> '{}' not in ('胸','背','腿','肩','手臂','核心','全身','其他'))
      or jsonb_array_length(d->'videoUrls')>8 then return false; end if;
    if not (d ? 'durationMinutes') or (d->'durationMinutes'<>'null'::jsonb and
      (jsonb_typeof(d->'durationMinutes')<>'number' or (d->>'durationMinutes') !~ '^[0-9]+$')) then return false; end if;
    if d->'durationMinutes'<>'null'::jsonb and (d->>'durationMinutes')::numeric not between 1 and 1440 then return false; end if;
    for u in select value from jsonb_array_elements(d->'videoUrls') loop
      if jsonb_typeof(u)<>'string' or length(u #>> '{}')>250 or (u #>> '{}') !~* '^https?://[^[:space:]/]+' then return false; end if;
    end loop;
    seen := array_append(seen,d->>'id');
  end loop;
  return true;
end $$;

create table if not exists public.training_plans (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  days jsonb not null default '[]'::jsonb check(public.valid_training_plan_days(days)),
  current_day_id text,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  check ((jsonb_array_length(days)=0 and current_day_id is null) or
    (jsonb_array_length(days)>0 and current_day_id is not null and
      jsonb_path_exists(days,'$[*] ? (@.id == $id)',jsonb_build_object('id',current_day_id))))
);
alter table public.training_logs add column if not exists plan_completion_key uuid;
create unique index if not exists idx_training_logs_completion on public.training_logs(user_id,plan_completion_key) where plan_completion_key is not null;

alter table public.training_plans enable row level security;
drop policy if exists training_plans_owner on public.training_plans;
create policy training_plans_owner on public.training_plans for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.training_plans from public, anon;
grant select,insert,update on public.training_plans to authenticated;

create or replace function public.save_training_plan(p_expected_version bigint,p_name text,p_days jsonb,p_current_day_id text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_row public.training_plans;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('training-plan:'||auth.uid()::text,0));
  select * into current_row from public.training_plans where user_id=auth.uid() for update;
  if p_expected_version is null or p_expected_version<>coalesce(current_row.version,0) then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  insert into public.training_plans(user_id,name,days,current_day_id,version)
    values(auth.uid(),p_name,p_days,p_current_day_id,1)
    on conflict(user_id) do update set name=excluded.name,days=excluded.days,current_day_id=excluded.current_day_id,
      version=training_plans.version+1,updated_at=now()
    returning * into current_row;
  return to_jsonb(current_row);
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
  insert into public.training_logs(user_id,occurred_at,occurred_has_explicit_time,training_type,body_parts,teacher,course,duration_minutes,notes,plan_completion_key)
    values(auth.uid(),(p_log->>'occurredAt')::timestamptz,coalesce((p_log->>'occurredHasExplicitTime')::boolean,false),
      p_log->>'trainingType',p_log->'bodyParts',coalesce(p_log->>'teacher',''),coalesce(p_log->>'course',''),
      (p_log->>'durationMinutes')::integer,coalesce(p_log->>'notes',''),p_request_key) returning * into saved;
  select ordinality::integer-1 into day_index from jsonb_array_elements(current_row.days) with ordinality where value->>'id'=p_day_id;
  update public.training_plans set current_day_id=days->((day_index+1)%jsonb_array_length(days))->>'id',version=version+1,updated_at=now()
    where user_id=auth.uid() returning * into current_row;
  return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved));
end $$;

revoke all on function public.save_training_plan(bigint,text,jsonb,text) from public,anon;
revoke all on function public.complete_training_plan(bigint,text,uuid,jsonb) from public,anon;
grant execute on function public.save_training_plan(bigint,text,jsonb,text) to authenticated;
grant execute on function public.complete_training_plan(bigint,text,uuid,jsonb) to authenticated;

commit;
