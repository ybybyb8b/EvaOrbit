begin;

create schema if not exists evaorbit_agent_private;
revoke all on schema evaorbit_agent_private from public, anon, authenticated;

create table evaorbit_agent_private.bridge_keys (
  digest bytea primary key check (octet_length(digest) = 32)
);

create table public.agent_connections (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  state text not null default 'pending' check (state in ('pending','active','paused','revoked')),
  policy jsonb not null default '{}' check (jsonb_typeof(policy) = 'object' and octet_length(policy::text) <= 24000),
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  expires_at timestamptz,
  revision integer not null default 0,
  primary key (user_id, client_id)
);

create table public.agent_access_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  client_id uuid not null,
  occurred_at timestamptz not null default now(),
  resource text not null check (char_length(resource) <= 100),
  operation text not null check (char_length(operation) <= 106),
  target text check (char_length(target) <= 200),
  result text not null check (result in ('started','allowed','blocked','failed')),
  foreign key (user_id, client_id) references public.agent_connections on delete cascade
);
create index agent_access_history_account_recent on public.agent_access_history (user_id, occurred_at desc, id desc);
create index agent_access_history_connection_recent on public.agent_access_history (user_id, client_id, occurred_at desc);

-- Migrate verified pre-existing Auth consents. Keep ChatGPT's client and tokens.
-- The previous Hermes connection is retired for its owners.
insert into public.agent_connections (user_id,client_id,name,state,policy,created_at,authorized_at)
select user_id,client_id,'ChatGPT','active',$policy$
  {
    "permissions": [
      "memory_candidate:search", "memory_candidate:get",
      "memory_entity:search", "memory_entity:get",
      "memory_fact:search", "memory_fact:get",
      "memory_source:search", "memory_source:get",
      "inbox:search", "inbox:get", "inbox:create", "inbox:update", "inbox:action:mark_processed", "inbox:action:archive", "inbox:action:restore",
      "task:search", "task:get", "task:create", "task:update", "task:action:complete", "task:action:reopen",
      "echo:search", "echo:get", "echo:create", "echo:update",
      "chronicle:search", "chronicle:get", "chronicle:create", "chronicle:update",
      "lucius_diary:search", "lucius_diary:get", "lucius_diary:create", "lucius_diary:update",
      "lucius_state:get", "lucius_state:update",
      "project:search", "project:get", "project:create", "project:update",
      "project_item:search", "project_item:get", "project_item:create", "project_item:update",
      "relation_person:search", "relation_person:get", "relation_person:create", "relation_person:update",
      "relation_event:search", "relation_event:get", "relation_event:create", "relation_event:update",
      "person_note:search", "person_note:get", "person_note:create", "person_note:update",
      "memory_context:search",
      "calendar_event:search", "calendar_event:get", "calendar_event:create", "calendar_event:update",
      "lucius_post:search", "lucius_post:get", "lucius_post:create", "lucius_post:update",
      "lucius_post_comment:search", "lucius_post_comment:get", "lucius_post_comment:create", "lucius_post_comment:update",
      "health_record:search", "health_record:get", "health_record:create", "health_record:update",
      "training_log:search", "training_log:get", "training_log:create", "training_log:update",
      "media:search", "media:get", "media:create", "media:update", "media:action:add_viewing", "media:action:update_viewing",
      "media_series:search", "media_series:get", "media_series:create", "media_series:update",
      "drink_limit:search", "drink_limit:get", "drink_limit:create", "drink_limit:update",
      "tracker:search", "tracker:get", "tracker:create", "tracker:update", "tracker:action:create_entry", "tracker:action:update_entry",
      "cat_pet:search", "cat_pet:get", "cat_pet:create", "cat_pet:update",
      "cat_record:search", "cat_record:get", "cat_record:create", "cat_record:update",
      "cat_routine:search", "cat_routine:get", "cat_routine:create", "cat_routine:update", "cat_routine:action:complete", "cat_routine:action:skip",
      "reminder:search", "reminder:get", "reminder:create", "reminder:update", "reminder:action:complete", "reminder:action:skip", "reminder:action:snooze",
      "subscription:search", "subscription:get",
      "software_library:search", "software_library:get", "software_library:create", "software_library:update",
      "food_place:search", "food_place:get", "food_place:create", "food_place:update",
      "food_dish:search", "food_dish:get", "food_dish:create", "food_dish:update",
      "food_log:search", "food_log:get", "food_log:create", "food_log:update",
      "drink_log:search", "drink_log:get", "drink_log:create", "drink_log:update",
      "food_library:search", "food_library:get", "food_library:create", "food_library:update",
      "nutrition_daily:get",
      "daily_energy:get", "daily_energy:action:upsert",
      "insight_context:get"
    ],
    "allProjects": true,
    "allTrackers": true,
    "inboxOwn": false
  }
$policy$::jsonb,granted_at,granted_at
from auth.oauth_consents
where client_id='614ae2e8-5759-40eb-ae0c-97188bc2010c' and revoked_at is null;

insert into public.agent_connections (user_id,client_id,name,state,created_at,authorized_at)
select user_id,client_id,'Hermes','revoked',granted_at,granted_at
from auth.oauth_consents where client_id='a2035497-982a-4811-8711-acc12c5a2064';

alter table public.agent_connections enable row level security;
alter table public.agent_access_history enable row level security;
revoke all on public.agent_connections, public.agent_access_history from public, anon, authenticated;
grant select on public.agent_connections, public.agent_access_history to authenticated;
grant insert (client_id,name) on public.agent_connections to authenticated;
grant update (name,state,policy,authorized_at,expires_at,revision) on public.agent_connections to authenticated;

create function public.evaorbit_is_external_oauth() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ? 'client_id', false)
    or coalesce(auth.jwt()->>'aud' = 'https://eva-orbit.vercel.app/api/mcp', false)
    or coalesce((auth.jwt()->'aud') ? 'https://eva-orbit.vercel.app/api/mcp', false)
$$;
grant execute on function public.evaorbit_is_external_oauth() to public;

create policy agent_connection_owner_read on public.agent_connections for select to authenticated
  using (user_id = (select auth.uid()) and not (select public.evaorbit_is_external_oauth()));
create policy agent_connection_owner_insert on public.agent_connections for insert to authenticated
  with check (user_id = (select auth.uid()) and not (select public.evaorbit_is_external_oauth()));
create policy agent_connection_owner_update on public.agent_connections for update to authenticated
  using (user_id = (select auth.uid()) and not (select public.evaorbit_is_external_oauth()) and state <> 'revoked')
  with check (user_id = (select auth.uid()) and not (select public.evaorbit_is_external_oauth()));
create policy agent_history_owner_read on public.agent_access_history for select to authenticated
  using (user_id = (select auth.uid()) and not (select public.evaorbit_is_external_oauth()));

-- Every Data API request, including SECURITY DEFINER RPCs, crosses this boundary.
-- The shared secret is a 256-bit random value; the database stores only its digest.
create function public.evaorbit_agent_data_boundary() returns void
language plpgsql security definer set search_path = '' as $$
declare proof text;
begin
  perform set_config('evaorbit.agent_bridge_verified', 'no', true);
  if not public.evaorbit_is_external_oauth() then return; end if;
  proof := (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-evaorbit-agent-bridge';
  if length(proof) = 64 and exists (
    select 1 from evaorbit_agent_private.bridge_keys where digest = sha256(convert_to(proof,'UTF8'))
  ) then
    perform set_config('evaorbit.agent_bridge_verified', 'yes', true);
    return;
  end if;
  raise insufficient_privilege using message = 'External AI credentials are restricted to EvaOrbit MCP';
end $$;

revoke all on function public.evaorbit_agent_data_boundary() from public;
grant execute on function public.evaorbit_agent_data_boundary() to anon, authenticated, service_role;

create function evaorbit_agent_private.connection_client() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if current_setting('evaorbit.agent_bridge_verified',true) is distinct from 'yes'
    or auth.uid() is null or nullif(auth.jwt()->>'client_id','') is null then
    raise insufficient_privilege using message = 'EvaOrbit Agent bridge required';
  end if;
  return (auth.jwt()->>'client_id')::uuid;
end $$;

create function public.evaorbit_agent_session() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  client uuid := evaorbit_agent_private.connection_client();
  connection public.agent_connections;
begin
  insert into public.agent_connections (user_id,client_id,name)
    values (auth.uid(),client,case client::text
      when '614ae2e8-5759-40eb-ae0c-97188bc2010c' then 'ChatGPT'
      when 'a2035497-982a-4811-8711-acc12c5a2064' then 'Hermes'
      else 'AI Agent' end)
    on conflict (user_id,client_id) do nothing;
  select * into strict connection from public.agent_connections where user_id=auth.uid() and client_id=client;
  if not exists (select 1 from auth.oauth_consents
    where user_id=auth.uid() and client_id=client and revoked_at is null) then
    connection.state := 'revoked';
  end if;
  return to_jsonb(connection);
end $$;

create function public.evaorbit_agent_audit(p_resource text,p_operation text,p_target text,p_result text,p_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  client uuid := evaorbit_agent_private.connection_client();
  audit_id bigint;
begin
  if p_id is null then
    insert into public.agent_access_history(user_id,client_id,resource,operation,target,result)
      values(auth.uid(),client,p_resource,p_operation,p_target,p_result) returning id into audit_id;
  else
    update public.agent_access_history set result=p_result,target=coalesce(p_target,target)
      where id=p_id and user_id=auth.uid() and client_id=client and result='started' returning id into audit_id;
  end if;
  return audit_id;
end $$;

alter table public.inbox_items add column agent_client_id uuid;
create index inbox_agent_items on public.inbox_items (user_id,agent_client_id,id desc) where agent_client_id is not null;
create table evaorbit_agent_private.inbox_receipts (
  user_id uuid not null,
  client_id uuid not null,
  request_id uuid not null,
  payload_hash bytea not null,
  item_id bigint references public.inbox_items on delete set null,
  foreign key (user_id,client_id) references public.agent_connections on delete cascade,
  primary key (user_id,client_id,request_id)
);

-- Other business services can span multiple PostgREST requests. Reserve their
-- key durably before dispatch and never replay a write with an unknown outcome.
create table evaorbit_agent_private.write_receipts (
  user_id uuid not null,
  client_id uuid not null,
  request_id uuid not null,
  fingerprint text not null check (length(fingerprint)=64),
  result text not null default 'unknown' check (result in ('unknown','allowed','failed')),
  target text,
  foreign key (user_id,client_id) references public.agent_connections on delete cascade,
  primary key (user_id,client_id,request_id)
);

create function public.evaorbit_agent_write_receipt(p_request_id uuid,p_fingerprint text,p_result text default null,p_target text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  client uuid := evaorbit_agent_private.connection_client();
  receipt evaorbit_agent_private.write_receipts;
  claimed boolean;
begin
  if p_result is null then
    insert into evaorbit_agent_private.write_receipts(user_id,client_id,request_id,fingerprint)
      values(auth.uid(),client,p_request_id,p_fingerprint)
      on conflict (user_id,client_id,request_id) do nothing returning true into claimed;
    select * into strict receipt from evaorbit_agent_private.write_receipts
      where user_id=auth.uid() and client_id=client and request_id=p_request_id;
    if receipt.fingerprint <> p_fingerprint then
      raise unique_violation using message = 'Request ID already used with different input';
    end if;
  else
    update evaorbit_agent_private.write_receipts set result=p_result,target=p_target
      where user_id=auth.uid() and client_id=client and request_id=p_request_id
        and fingerprint=p_fingerprint and result='unknown' returning * into strict receipt;
  end if;
  return jsonb_build_object('claimed',coalesce(claimed,false),'result',receipt.result,'target',receipt.target);
end $$;

create function public.evaorbit_agent_capture(p_content text,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  client uuid := evaorbit_agent_private.connection_client();
  receipt evaorbit_agent_private.inbox_receipts;
  item public.inbox_items;
  claimed boolean;
  payload_hash bytea := sha256(convert_to(p_content,'UTF8'));
begin
  if char_length(btrim(p_content)) not between 1 and 10000 or p_content is null then
    raise invalid_parameter_value using message = 'Invalid Inbox content';
  end if;
  if p_request_id is not null then
    insert into evaorbit_agent_private.inbox_receipts(user_id,client_id,request_id,payload_hash)
      values(auth.uid(),client,p_request_id,payload_hash)
      on conflict (user_id,client_id,request_id) do nothing returning true into claimed;
    select * into strict receipt from evaorbit_agent_private.inbox_receipts r
      where r.user_id=auth.uid() and r.client_id=client and r.request_id=p_request_id for update;
    if receipt.payload_hash <> payload_hash then
      raise unique_violation using message = 'Request ID already used with different content';
    end if;
    if receipt.item_id is not null then
      select * into item from public.inbox_items
        where id=receipt.item_id and user_id=auth.uid() and agent_client_id=client;
      return to_jsonb(item);
    end if;
    if not coalesce(claimed,false) then return null; end if;
  end if;
  insert into public.inbox_items(user_id,content,source,agent_client_id)
    values(auth.uid(),p_content,'chatgpt',client) returning * into item;
  if p_request_id is not null then
    update evaorbit_agent_private.inbox_receipts r set item_id=item.id
      where r.user_id=auth.uid() and r.client_id=client and r.request_id=p_request_id;
  end if;
  return to_jsonb(item);
end $$;

revoke all on function public.evaorbit_agent_session(),
  public.evaorbit_agent_audit(text,text,text,text,bigint), public.evaorbit_agent_capture(text,uuid),
  public.evaorbit_agent_write_receipt(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.evaorbit_agent_session(),
  public.evaorbit_agent_audit(text,text,text,text,bigint), public.evaorbit_agent_capture(text,uuid),
  public.evaorbit_agent_write_receipt(uuid,text,text,text) to authenticated;

-- Newly consented clients receive the existing MCP audience. Connection registration alone grants no tools.
create or replace function public.evaorbit_mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := event->'claims';
begin
  if claims->>'client_id' in ('614ae2e8-5759-40eb-ae0c-97188bc2010c','a2035497-982a-4811-8711-acc12c5a2064')
    or (exists (select 1 from evaorbit_agent_private.bridge_keys)
      and exists (select 1 from public.agent_connections
        where user_id::text=event->>'user_id' and client_id::text=claims->>'client_id')) then
    claims := jsonb_set(claims,'{aud}',to_jsonb('https://eva-orbit.vercel.app/api/mcp'::text),true);
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.evaorbit_mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.evaorbit_mcp_access_token_hook(jsonb) to supabase_auth_admin;

-- Cutover is explicit. Staging this migration does not change the Data API hook.
create function evaorbit_agent_private.activate(p_digest bytea) returns void
language plpgsql set search_path = '' as $$
declare protected_table record;
begin
  if exists (
    select 1 from pg_db_role_setting, unnest(setconfig) as setting
      where setrole='authenticator'::regrole and setting like 'pgrst.db_pre_request=%'
        and (setdatabase<>0 or setting <> 'pgrst.db_pre_request=public.evaorbit_agent_data_boundary')
  ) then raise exception 'Integrate the existing Data API pre-request hook before activating Agent access'; end if;

  -- Storage uses a separate API and never accepts the Data API proof.
  for protected_table in
    select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime'
    union select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relrowsecurity and c.relkind in ('r','p')
    union select 'realtime','messages' where to_regclass('realtime.messages') is not null
    union select 'storage','objects'
    union select 'storage','buckets'
  loop
    if not exists (select 1 from pg_policies where schemaname=protected_table.schemaname
        and tablename=protected_table.tablename and policyname='evaorbit_agent_data_path') then
      if protected_table.schemaname='storage' then
        execute format('create policy evaorbit_agent_data_path on %I.%I as restrictive for all using (not (select public.evaorbit_is_external_oauth())) with check (not (select public.evaorbit_is_external_oauth()))',protected_table.schemaname,protected_table.tablename);
      else
        execute format('create policy evaorbit_agent_data_path on %I.%I as restrictive for all using (not (select public.evaorbit_is_external_oauth()) or (select current_setting(''evaorbit.agent_bridge_verified'',true)) = ''yes'') with check (not (select public.evaorbit_is_external_oauth()) or (select current_setting(''evaorbit.agent_bridge_verified'',true)) = ''yes'')',protected_table.schemaname,protected_table.tablename);
      end if;
    end if;
  end loop;
  insert into evaorbit_agent_private.bridge_keys values(p_digest) on conflict do nothing;
  alter role authenticator set pgrst.db_pre_request = 'public.evaorbit_agent_data_boundary';
  perform pg_notify('pgrst','reload config');
end $$;
revoke all on function evaorbit_agent_private.activate(bytea) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
