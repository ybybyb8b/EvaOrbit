begin;

-- The five-argument overload completes an existing imported Workout. Keep the old
-- four-argument contract for installed clients that create independent logs.
create or replace function public.complete_training_plan(p_expected_version bigint,p_day_id text,p_request_key uuid,p_log jsonb,p_workout_log_id bigint)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_row public.training_plans; saved public.training_logs; day_index integer; day jsonb; session jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('training-plan:'||auth.uid()::text,0));
  select * into current_row from public.training_plans where user_id=auth.uid() for update;
  if current_row.user_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  select * into saved from public.training_logs where user_id=auth.uid() and plan_completion_key=p_request_key;
  if saved.id is not null then
    if (p_workout_log_id is not null and saved.id<>p_workout_log_id) or (p_workout_log_id is null and saved.workout_sample_id is not null) then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
    return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved));
  end if;
  if p_request_key is null or p_expected_version is null or p_expected_version<>current_row.version or p_day_id is distinct from current_row.current_day_id or current_row.current_day_id is null then raise exception 'TRAINING_PLAN_CONFLICT'; end if;
  if jsonb_typeof(p_log) is distinct from 'object' then raise exception 'Invalid training log'; end if;
  select ordinality::integer-1,value into day_index,day from jsonb_array_elements(current_row.days) with ordinality where value->>'id'=p_day_id;
  session=jsonb_set(coalesce(nullif(p_log->'sessionDetails','null'::jsonb),'{"plan":null,"exercises":[],"videos":[]}'::jsonb),'{plan}',
    jsonb_build_object('name',current_row.name,'dayName',day->>'name','dayNumber',day_index+1,'content',coalesce(day->>'content','')));
  if p_workout_log_id is not null then
    select * into saved from public.training_logs where id=p_workout_log_id and user_id=auth.uid() for update;
    if saved.id is null or saved.workout_sample_id is null or saved.workout_deleted then raise exception 'TRAINING_WORKOUT_NOT_AVAILABLE'; end if;
    if saved.plan_completion_key is not null then raise exception 'TRAINING_WORKOUT_ALREADY_COMPLETED'; end if;
    if p_log ?| array['occurredAt','occurredHasExplicitTime','trainingType','durationMinutes'] then raise exception 'Workout source is read only'; end if;
    update public.training_logs set body_parts=p_log->'bodyParts',teacher=coalesce(p_log->>'teacher',''),course=coalesce(p_log->>'course',''),
      notes=coalesce(p_log->>'notes',''),training_content=coalesce(p_log->>'trainingContent',''),session_details=session,plan_completion_key=p_request_key
      where id=p_workout_log_id and user_id=auth.uid() returning * into saved;
  else
    insert into public.training_logs(user_id,occurred_at,occurred_has_explicit_time,training_type,body_parts,teacher,course,duration_minutes,notes,plan_completion_key,session_details,training_content)
      values(auth.uid(),(p_log->>'occurredAt')::timestamptz,coalesce((p_log->>'occurredHasExplicitTime')::boolean,false),p_log->>'trainingType',p_log->'bodyParts',
        coalesce(p_log->>'teacher',''),coalesce(p_log->>'course',''),(p_log->>'durationMinutes')::integer,coalesce(p_log->>'notes',''),p_request_key,session,coalesce(p_log->>'trainingContent','')) returning * into saved;
  end if;
  update public.training_plans set current_day_id=days->((day_index+1)%jsonb_array_length(days))->>'id',version=version+1,updated_at=now() where user_id=auth.uid() returning * into current_row;
  return jsonb_build_object('plan',to_jsonb(current_row),'log',to_jsonb(saved));
end $$;
revoke all on function public.complete_training_plan(bigint,text,uuid,jsonb,bigint) from public,anon;
grant execute on function public.complete_training_plan(bigint,text,uuid,jsonb,bigint) to authenticated;

create or replace function public.complete_training_plan(p_expected_version bigint,p_day_id text,p_request_key uuid,p_log jsonb)
returns jsonb language sql security invoker set search_path=public as $$
  select public.complete_training_plan(p_expected_version,p_day_id,p_request_key,p_log,null::bigint);
$$;
revoke all on function public.complete_training_plan(bigint,text,uuid,jsonb) from public,anon;
grant execute on function public.complete_training_plan(bigint,text,uuid,jsonb) to authenticated;
commit;
