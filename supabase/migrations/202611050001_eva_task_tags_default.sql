-- Tasks.tags is text[], unlike SQLite JSON. Use the existing database default.
begin;
create or replace function public.eva_command(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); cfg public.eva_settings; j public.eva_jobs;
  entry bigint; task_id bigint; rule_id bigint; v_reminder_id bigint; at_time timestamptz;
  r jsonb; item jsonb; ids jsonb; idx integer; review_needed boolean; approved boolean:=false; target text;
begin
  if uid is null then raise exception 'EVA_AUTH'; end if;
  insert into public.eva_settings(user_id) values(uid) on conflict do nothing;
  select * into cfg from public.eva_settings where user_id=uid for update;
  if p_action='settings' then
    update public.eva_settings set enabled=case when p_data ? 'enabled' then (p_data->>'enabled')::boolean else enabled end,
      pricing=case when p_data ? 'pricing' then nullif(p_data->'pricing','null'::jsonb) else pricing end where user_id=uid returning * into cfg;
    return jsonb_build_object('enabled',cfg.enabled,'pricing',cfg.pricing);
  elsif p_action='list' then
    return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from public.eva_jobs where user_id=uid order by created_at desc limit 50) x),'[]');
  elsif p_action='calls' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'jobId',job_id,'createdAt',created_at)||coalesce(usage,'{"input":null,"output":null,"cached":null,"cost":null,"currency":null,"model":"unknown","pricing":null,"promptVersion":"unknown"}'::jsonb) order by created_at desc) from public.eva_calls where user_id=uid),'[]');
  elsif p_action='capture' then
    select * into j from public.eva_jobs where user_id=uid and id=(p_data->>'key')::uuid;
    if found then if j.content<>p_data->>'content' then raise exception 'EVA_CAPTURE_CONFLICT'; end if; return to_jsonb(j); end if;
    insert into public.inbox_items(user_id,content,source) values(uid,p_data->>'content','eva-paper') returning id into entry;
    insert into public.eva_jobs(id,user_id,inbox_id,content,status) values((p_data->>'key')::uuid,uid,entry,p_data->>'content',case when cfg.enabled and (p_data->>'process')::boolean then 'queued' else 'held' end) returning * into j;
    return to_jsonb(j);
  elsif p_action='usage' then
    update public.eva_calls set usage=p_data->'usage' where user_id=uid and id=(p_data->>'id')::uuid;
    return 'null';
  end if;
  select * into j from public.eva_jobs where user_id=uid and id=(p_data->>'id')::uuid for update;
  if not found then return 'null'; end if;
  if p_action='get' then return to_jsonb(j);
  elsif p_action='claim' then
    if not cfg.enabled or j.attempts>=10 or not(j.status='queued' or j.status='running' and j.lease_until<now()) then return 'null'; end if;
    update public.eva_jobs set status='running',lease=(p_data->>'lease')::uuid,lease_until=now()+interval '2 minutes',attempts=attempts+1,error=null,updated_at=now() where id=j.id returning * into j;
    insert into public.eva_calls(id,user_id,job_id) values(j.lease,uid,j.id);
    return to_jsonb(j);
  elsif p_action='fail' then
    update public.eva_jobs set status='failed',error='这次未能整理，原文已保留。可重试或仅留在 Inbox。',lease=null,lease_until=null,updated_at=now() where id=j.id and status='running' and lease=(p_data->>'lease')::uuid;
    return 'null';
  elsif p_action='finish' then
    if j.status<>'running' or j.lease<>(p_data->>'lease')::uuid then raise exception 'EVA_LEASE'; end if;
    if not cfg.enabled then
      update public.eva_jobs set status='held',lease=null,lease_until=null,updated_at=now() where id=j.id returning * into j; return to_jsonb(j);
    end if;
    r:=p_data->'result';
  elsif p_action='decide' then
    if j.status='done' or j.status='running' and j.lease_until>now() then raise exception 'EVA_STATE'; end if;
    target:=p_data->>'action';
    if target='retry' and j.status not in ('held','failed') then raise exception 'EVA_STATE'; end if;
    if target='approve' then
      if j.status<>'review' or j.result is null then raise exception 'EVA_REVIEW'; end if;
      r:=j.result; approved:=true;
    else
      if target not in ('keep','retry','revise') then raise exception 'EVA_ACTION'; end if;
      if target<>'keep' and not cfg.enabled then raise exception 'EVA_DISABLED'; end if;
      if target='revise' and exists(select 1 from jsonb_array_elements_text(j.task_ids) x where x::bigint>0) then raise exception 'EVA_ALREADY_APPLIED'; end if;
      if target='revise' then
        select coalesce(jsonb_agg(v order by n),'[]') into j.context from jsonb_array_elements(j.context||jsonb_build_array(p_data->>'instruction')) with ordinality t(v,n) where n>jsonb_array_length(j.context||jsonb_build_array(p_data->>'instruction'))-4;
      end if;
      update public.eva_jobs set status=case when target='keep' then 'done' else 'queued' end,context=j.context,lease=null,lease_until=null,error=null,updated_at=now() where id=j.id returning * into j;
      return to_jsonb(j);
    end if;
  else raise exception 'EVA_ACTION'; end if;
  if jsonb_typeof(r->'tasks')<>'array' or jsonb_array_length(r->'tasks')>8 then raise exception 'EVA_RESULT'; end if;
  ids:=j.task_ids;
  for item,idx in select v,(n-1)::integer from jsonb_array_elements(r->'tasks') with ordinality t(v,n) loop
    if coalesce((ids->>idx)::bigint,0)>0 or (not approved and ((item->>'review')::boolean or (r->>'review')::boolean)) then continue; end if;
    insert into public.tasks(user_id,title,notes,due_date,due_time,priority) values(uid,item->>'title',item->>'notes',(item->>'dueDate')::date,(item->>'dueTime')::time,'medium') returning id into task_id;
    while jsonb_array_length(ids)<=idx loop ids:=ids||'0'::jsonb; end loop;
    ids:=jsonb_set(ids,array[idx::text],to_jsonb(task_id));
    if (item->>'remind')::boolean then
      at_time:=((item->>'dueDate')::date+(item->>'dueTime')::time) at time zone 'Asia/Shanghai';
      if at_time is null then raise exception 'EVA_REMINDER'; end if;
      insert into public.task_reminders(user_id,task_id,trigger_type,relative_to,offset_minutes,timezone,repeat_while_overdue) values(uid,task_id,'relative','due',0,'Asia/Shanghai',false) returning id into rule_id;
      insert into public.reminders(user_id,title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,timezone,note,lead_time_minutes,repeat_while_overdue,status,is_active,due_has_explicit_time,overdue_after)
        values(uid,item->>'title','task',task_id,'task_reminder',rule_id,'one_time',at_time,at_time,'Asia/Shanghai',item->>'notes',0,false,'scheduled',true,true,at_time) returning id into v_reminder_id;
      update public.task_reminders set reminder_id=v_reminder_id where id=rule_id;
      update public.tasks set reminder_id=v_reminder_id where id=task_id;
    end if;
  end loop;
  review_needed:=not approved and ((r->>'review')::boolean or exists(select 1 from jsonb_array_elements(r->'tasks') t where (t->>'review')::boolean));
  update public.eva_jobs set status=case when review_needed then 'review' else 'done' end,result=r,task_ids=ids,error=null,lease=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  if not review_needed and coalesce(r->>'remaining','')='' and jsonb_array_length(ids)>0 then update public.inbox_items set status='processed',processed_at=now() where id=j.inbox_id and user_id=uid and status='inbox'; end if;
  return to_jsonb(j);
end $$;
commit;
