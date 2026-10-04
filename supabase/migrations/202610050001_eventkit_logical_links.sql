-- Account identity survives Host deletion. eventkit_links remains the installation binding table.
create table if not exists public.eventkit_logical_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check(entity_type in ('task','reminder','calendar_event')),
  eo_id bigint not null,
  eventkit_entity_type text not null check(eventkit_entity_type in ('reminder','event')),
  recovery_token uuid not null default gen_random_uuid(),
  external_identifier text,
  pending_creation boolean not null default false,
  mirror_generation text,
  creation_lease uuid,
  creation_lease_until timestamptz,
  initial_snapshot jsonb not null,
  initial_hash text not null,
  created_at timestamptz not null default now(),
  unique(user_id,entity_type,eo_id),
  unique(user_id,id)
);
alter table public.eventkit_logical_links enable row level security;
drop policy if exists eventkit_logical_links_owner_all on public.eventkit_logical_links;
create policy eventkit_logical_links_owner_all on public.eventkit_logical_links for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.eventkit_logical_links to authenticated;

alter table public.eventkit_links add column if not exists logical_link_id uuid;
alter table public.eventkit_links add column if not exists recovery_token uuid;
insert into public.eventkit_logical_links(user_id,entity_type,eo_id,eventkit_entity_type,external_identifier,initial_snapshot,initial_hash)
  select distinct on(user_id,entity_type,eo_id) user_id,entity_type,eo_id,eventkit_entity_type,external_identifier,last_synced_snapshot,last_synced_hash
  from public.eventkit_links order by user_id,entity_type,eo_id,last_synced_at desc,id desc
  on conflict(user_id,entity_type,eo_id) do nothing;
update public.eventkit_links b set logical_link_id=l.id
  from public.eventkit_logical_links l where b.logical_link_id is null and b.user_id=l.user_id and b.entity_type=l.entity_type and b.eo_id=l.eo_id;
alter table public.eventkit_links alter column logical_link_id set not null;
update public.eventkit_links b set recovery_token=l.recovery_token from public.eventkit_logical_links l where b.logical_link_id=l.id and b.recovery_token is null;
-- Historical rows and their individual baselines are preserved verbatim.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='eventkit_binding_logical_owner_fk' and conrelid='public.eventkit_links'::regclass) then
    alter table public.eventkit_links add constraint eventkit_binding_logical_owner_fk foreign key(user_id,logical_link_id)
      references public.eventkit_logical_links(user_id,id) on delete cascade;
  end if;
end $$;
create unique index if not exists eventkit_binding_logical_installation on public.eventkit_links(logical_link_id,installation_id);
create index if not exists eventkit_binding_account_identity on public.eventkit_links(user_id,eventkit_entity_type,external_identifier);

-- Report only: never merge/delete suspected duplicates during migration.
create or replace view public.eventkit_identity_conflicts with(security_invoker=true) as
  with identities as (
    select user_id,eventkit_entity_type,external_identifier,id as logical_link_id,eo_id from public.eventkit_logical_links
    union select user_id,eventkit_entity_type,external_identifier,logical_link_id,eo_id from public.eventkit_links
  )select user_id,eventkit_entity_type,external_identifier,array_agg(distinct logical_link_id) as logical_link_ids,array_agg(distinct eo_id) as eo_ids
  from identities where external_identifier is not null and logical_link_id is not null
  group by user_id,eventkit_entity_type,external_identifier having count(distinct logical_link_id)>1;
grant select on public.eventkit_identity_conflicts to authenticated;

create or replace function public.reserve_eventkit_link(p_entity_type text,p_eo_id bigint,p_kind text,p_snapshot jsonb,p_hash text,p_next_occurrence boolean default false,p_prepare_creation boolean default false,p_creation_lease uuid default null)
returns public.eventkit_logical_links language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_link public.eventkit_logical_links;v_owned boolean:=false;
begin
  if v_user is null then raise exception 'Authentication required';end if;
  if p_entity_type='task' then select exists(select 1 from public.tasks where id=p_eo_id and user_id=v_user) into v_owned;
  elsif p_entity_type='reminder' then select exists(select 1 from public.reminders where id=p_eo_id and user_id=v_user) into v_owned;
  elsif p_entity_type='calendar_event' then select exists(select 1 from public.calendar_events where id=p_eo_id and user_id=v_user) into v_owned;end if;
  if not v_owned or (p_entity_type='calendar_event') is distinct from (p_kind='event') or p_kind not in('event','reminder')
    or jsonb_typeof(p_snapshot) is distinct from 'object' or p_hash !~ '^[0-9a-f]{64}$' or p_hash is null then raise exception 'Invalid EventKit logical link';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':eventkit',0));
  insert into public.eventkit_logical_links(user_id,entity_type,eo_id,eventkit_entity_type,initial_snapshot,initial_hash,pending_creation,mirror_generation)
    values(v_user,p_entity_type,p_eo_id,p_kind,p_snapshot,p_hash,p_kind='reminder',p_hash)
    on conflict(user_id,entity_type,eo_id) do nothing;
  select * into v_link from public.eventkit_logical_links where user_id=v_user and entity_type=p_entity_type and eo_id=p_eo_id for update;
  if p_prepare_creation and (p_creation_lease is null or (v_link.creation_lease_until>now() and v_link.creation_lease is distinct from p_creation_lease)) then
    raise exception 'Reminder creation in progress; retry later';
  end if;
  if p_next_occurrence and v_link.mirror_generation is distinct from p_hash then
    update public.eventkit_logical_links set recovery_token=gen_random_uuid(),external_identifier=null,pending_creation=true,mirror_generation=p_hash,initial_snapshot=p_snapshot,initial_hash=p_hash
      where id=v_link.id returning * into v_link;
  elsif p_prepare_creation and not v_link.pending_creation then
    update public.eventkit_logical_links set pending_creation=true,initial_snapshot=p_snapshot,initial_hash=p_hash,mirror_generation=p_hash
      where id=v_link.id returning * into v_link;
  end if;
  if p_prepare_creation then
    update public.eventkit_logical_links set creation_lease=p_creation_lease,creation_lease_until=now()+interval '2 minutes'
      where id=v_link.id returning * into v_link;
  end if;
  return v_link;
end $$;

create or replace function public.bind_eventkit_link(p_installation_id uuid,p_entity_type text,p_eo_id bigint,p_kind text,p_apple jsonb,p_snapshot jsonb,p_hash text)
returns public.eventkit_links language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_logical public.eventkit_logical_links;v_binding public.eventkit_links;
begin
  if p_installation_id is null or coalesce(p_apple->>'calendarItemIdentifier','')='' or coalesce(p_apple->>'calendarIdentifier','')='' or coalesce(p_apple->>'sourceIdentifier','')='' then raise exception 'Invalid EventKit binding';end if;
  v_logical:=public.reserve_eventkit_link(p_entity_type,p_eo_id,p_kind,p_snapshot,p_hash);
  if exists(select 1 from public.eventkit_links where user_id=v_user and eventkit_entity_type=p_kind and logical_link_id<>v_logical.id
    and (calendar_item_identifier=p_apple->>'calendarItemIdentifier'
      or (nullif(p_apple->>'externalIdentifier','') is not null and external_identifier=p_apple->>'externalIdentifier'))) then
    raise exception 'Ambiguous EventKit identity';
  end if;
  if exists(select 1 from public.eventkit_logical_links where user_id=v_user and eventkit_entity_type=p_kind and id<>v_logical.id and external_identifier=nullif(p_apple->>'externalIdentifier','')) then raise exception 'Ambiguous EventKit identity';end if;
  insert into public.eventkit_links(user_id,installation_id,logical_link_id,recovery_token,entity_type,eo_id,eventkit_entity_type,calendar_item_identifier,external_identifier,calendar_identifier,source_identifier,last_synced_hash,last_synced_snapshot,apple_last_modified_at)
    values(v_user,p_installation_id,v_logical.id,v_logical.recovery_token,p_entity_type,p_eo_id,p_kind,p_apple->>'calendarItemIdentifier',nullif(p_apple->>'externalIdentifier',''),p_apple->>'calendarIdentifier',p_apple->>'sourceIdentifier',p_hash,p_snapshot,(p_apple->>'lastModifiedAt')::timestamptz)
    on conflict(user_id,installation_id,entity_type,eo_id) do update set logical_link_id=excluded.logical_link_id,recovery_token=excluded.recovery_token,
      calendar_item_identifier=excluded.calendar_item_identifier,external_identifier=excluded.external_identifier,calendar_identifier=excluded.calendar_identifier,source_identifier=excluded.source_identifier,
      last_synced_hash=excluded.last_synced_hash,last_synced_snapshot=excluded.last_synced_snapshot,apple_last_modified_at=excluded.apple_last_modified_at,last_synced_at=now()
    returning * into v_binding;
  update public.eventkit_logical_links set pending_creation=false,creation_lease=null,creation_lease_until=null,external_identifier=coalesce(nullif(p_apple->>'externalIdentifier',''),external_identifier) where id=v_logical.id;
  return v_binding;
end $$;

create or replace function public.import_eventkit_calendar_event(p_installation_id uuid,p_apple jsonb,p_snapshot jsonb,p_hash text)
returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_id bigint;v_candidates bigint[];
begin
  if v_user is null then raise exception 'Authentication required';end if;
  if p_installation_id is null or jsonb_typeof(p_snapshot) is distinct from 'object' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or coalesce(p_apple->>'calendarItemIdentifier','')='' or coalesce(p_apple->>'calendarIdentifier','')='' or coalesce(p_apple->>'sourceIdentifier','')='' then raise exception 'Invalid EventKit import';end if;
  -- ponytail: serialize identity transactions per account; split if contention becomes measurable.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':eventkit',0));
  select array_agg(distinct eo_id) into v_candidates from (
    select eo_id from public.eventkit_links where user_id=v_user and eventkit_entity_type='event'
      and (calendar_item_identifier=p_apple->>'calendarItemIdentifier' or (nullif(p_apple->>'externalIdentifier','') is not null and external_identifier=p_apple->>'externalIdentifier'))
    union select eo_id from public.eventkit_logical_links where user_id=v_user and eventkit_entity_type='event' and external_identifier=nullif(p_apple->>'externalIdentifier','')
  ) candidates;
  if cardinality(v_candidates)>1 then raise exception 'Ambiguous EventKit identity';end if;
  v_id:=v_candidates[1];
  if v_id is not null and not exists(select 1 from public.calendar_events where id=v_id and user_id=v_user) then
    raise exception 'Linked EO record is missing; manual resolution required';
  end if;
  if v_id is null then
    insert into public.calendar_events(user_id,title,notes,start_at,end_at,is_all_day,timezone,location,status)
      values(v_user,p_snapshot->>'title',coalesce(p_snapshot->>'notes',''),p_snapshot->>'startAt',p_snapshot->>'endAt',(p_snapshot->>'isAllDay')::boolean,p_snapshot->>'timezone',coalesce(p_snapshot->>'location',''),coalesce(p_snapshot->>'status','confirmed')) returning id into v_id;
    perform public.bind_eventkit_link(p_installation_id,'calendar_event',v_id,'event',p_apple,p_snapshot,p_hash);
  else
    -- Preserve the historical three-way baseline; the client reconciles changed Apple state afterwards.
    perform public.bind_eventkit_link(p_installation_id,'calendar_event',v_id,'event',p_apple,
      coalesce(b.last_synced_snapshot,l.initial_snapshot),coalesce(b.last_synced_hash,l.initial_hash))
      from public.eventkit_logical_links l left join lateral(select last_synced_snapshot,last_synced_hash from public.eventkit_links
        where user_id=v_user and logical_link_id=l.id order by last_synced_at desc,id desc limit 1)b on true
      where l.user_id=v_user and l.entity_type='calendar_event' and l.eo_id=v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.reserve_eventkit_link(text,bigint,text,jsonb,text,boolean,boolean,uuid) from public;
revoke all on function public.bind_eventkit_link(uuid,text,bigint,text,jsonb,jsonb,text) from public;
revoke all on function public.import_eventkit_calendar_event(uuid,jsonb,jsonb,text) from public;
grant execute on function public.reserve_eventkit_link(text,bigint,text,jsonb,text,boolean,boolean,uuid),public.bind_eventkit_link(uuid,text,bigint,text,jsonb,jsonb,text),public.import_eventkit_calendar_event(uuid,jsonb,jsonb,text) to authenticated;
