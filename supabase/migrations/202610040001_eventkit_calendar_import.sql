-- Each RPC call is one transaction: no Calendar record can survive a failed link insert.
create or replace function public.import_eventkit_calendar_event(
  p_installation_id uuid, p_apple jsonb, p_snapshot jsonb, p_hash text
) returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_link public.eventkit_links%rowtype;
  v_eo_id bigint;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_installation_id is null or coalesce(p_apple->>'calendarItemIdentifier','') = ''
     or coalesce(p_apple->>'calendarIdentifier','') = '' or coalesce(p_apple->>'sourceIdentifier','') = ''
     or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'Invalid EventKit import';
  end if;
  -- ponytail: serialize imports per installation; split by identity if import contention becomes measurable.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_installation_id::text || ':eventkit-calendar',0));
  select * into v_link from public.eventkit_links
    where user_id=v_user_id and installation_id=p_installation_id and eventkit_entity_type='event'
      and calendar_item_identifier=p_apple->>'calendarItemIdentifier';
  if not found and coalesce(p_apple->>'externalIdentifier','') <> '' then
    select * into v_link from public.eventkit_links
      where user_id=v_user_id and installation_id=p_installation_id and eventkit_entity_type='event'
        and external_identifier=p_apple->>'externalIdentifier'
        and calendar_identifier=p_apple->>'calendarIdentifier' and source_identifier=p_apple->>'sourceIdentifier'
        and (select count(*) from public.eventkit_links l where l.user_id=v_user_id and l.installation_id=p_installation_id
          and l.eventkit_entity_type='event' and l.external_identifier=p_apple->>'externalIdentifier'
          and l.calendar_identifier=p_apple->>'calendarIdentifier' and l.source_identifier=p_apple->>'sourceIdentifier')=1;
  end if;
  if v_link.id is not null then
    select id into v_eo_id from public.calendar_events where id=v_link.eo_id and user_id=v_user_id;
    if found then return v_eo_id; end if;
    -- The EO record was explicitly removed, not omitted by a paged query.
    delete from public.eventkit_links where id=v_link.id;
  end if;
  insert into public.calendar_events(user_id,title,notes,start_at,end_at,is_all_day,timezone,location,status)
    values(v_user_id,p_snapshot->>'title',coalesce(p_snapshot->>'notes',''),p_snapshot->>'startAt',p_snapshot->>'endAt',
      (p_snapshot->>'isAllDay')::boolean,p_snapshot->>'timezone',coalesce(p_snapshot->>'location',''),coalesce(p_snapshot->>'status','confirmed'))
    returning id into v_eo_id;
  insert into public.eventkit_links(user_id,installation_id,entity_type,eo_id,eventkit_entity_type,
    calendar_item_identifier,external_identifier,calendar_identifier,source_identifier,last_synced_hash,last_synced_snapshot,apple_last_modified_at)
    values(v_user_id,p_installation_id,'calendar_event',v_eo_id,'event',p_apple->>'calendarItemIdentifier',
      nullif(p_apple->>'externalIdentifier',''),p_apple->>'calendarIdentifier',p_apple->>'sourceIdentifier',p_hash,p_snapshot,
      (p_apple->>'lastModifiedAt')::timestamptz);
  return v_eo_id;
end;
$$;
revoke all on function public.import_eventkit_calendar_event(uuid,jsonb,jsonb,text) from public;
grant execute on function public.import_eventkit_calendar_event(uuid,jsonb,jsonb,text) to authenticated;
