create or replace function public.import_eventkit_reminder_task(p_installation_id uuid,p_apple jsonb,p_snapshot jsonb,p_hash text)
returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_id bigint;v_candidates bigint[];
begin
  if v_user is null then raise exception 'Authentication required';end if;
  if p_installation_id is null or jsonb_typeof(p_snapshot) is distinct from 'object' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or coalesce(p_apple->>'calendarItemIdentifier','')='' or coalesce(p_apple->>'calendarIdentifier','')='' or coalesce(p_apple->>'sourceIdentifier','')='' then raise exception 'Invalid EventKit import';end if;
  -- ponytail: serialize identity transactions per account; split if contention becomes measurable.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':eventkit',0));
  if exists(select 1 from public.eventkit_logical_links where user_id=v_user and eventkit_entity_type='reminder' and entity_type<>'task'
    and (external_identifier=nullif(p_apple->>'externalIdentifier','') or exists(select 1 from public.eventkit_links b where b.logical_link_id=eventkit_logical_links.id and b.calendar_item_identifier=p_apple->>'calendarItemIdentifier'))) then raise exception 'Ambiguous EventKit identity';end if;
  select array_agg(distinct eo_id) into v_candidates from (
    select eo_id from public.eventkit_links where user_id=v_user and eventkit_entity_type='reminder'
      and (calendar_item_identifier=p_apple->>'calendarItemIdentifier' or (nullif(p_apple->>'externalIdentifier','') is not null and external_identifier=p_apple->>'externalIdentifier'))
    union select eo_id from public.eventkit_logical_links where user_id=v_user and eventkit_entity_type='reminder' and external_identifier=nullif(p_apple->>'externalIdentifier','')
  ) candidates;
  if cardinality(v_candidates)>1 then raise exception 'Ambiguous EventKit identity';end if;
  v_id:=v_candidates[1];
  if v_id is not null and not exists(select 1 from public.tasks where id=v_id and user_id=v_user) then
    raise exception 'Linked EO record is missing; manual resolution required';
  end if;
  if v_id is null then
    insert into public.tasks(user_id,title,notes,due_date,due_time,completed,completed_at,priority,tags)
      values(v_user,p_snapshot->>'title',coalesce(p_snapshot->>'notes',''),nullif(p_snapshot->>'dueDate','')::date,nullif(p_snapshot->>'dueTime','')::time,coalesce((p_snapshot->>'completed')::boolean,false),case when coalesce((p_snapshot->>'completed')::boolean,false) then nullif(p_snapshot->>'completionDate','')::timestamptz else null end,'medium','{}') returning id into v_id;
    perform public.bind_eventkit_link(p_installation_id,'task',v_id,'reminder',p_apple,p_snapshot,p_hash);
  else
    -- Preserve the historical three-way baseline; the client reconciles changed Apple state afterwards.
    perform public.bind_eventkit_link(p_installation_id,'task',v_id,'reminder',p_apple,
      coalesce(b.last_synced_snapshot,l.initial_snapshot),coalesce(b.last_synced_hash,l.initial_hash))
      from public.eventkit_logical_links l left join lateral(select last_synced_snapshot,last_synced_hash from public.eventkit_links
        where user_id=v_user and logical_link_id=l.id order by last_synced_at desc,id desc limit 1)b on true
      where l.user_id=v_user and l.entity_type='task' and l.eo_id=v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.import_eventkit_reminder_task(uuid,jsonb,jsonb,text) from public;
grant execute on function public.import_eventkit_reminder_task(uuid,jsonb,jsonb,text) to authenticated;
