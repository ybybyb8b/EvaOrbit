begin;

-- Every writer (Web, MCP and Native) advances the same row version.
alter table public.trackers add column if not exists sync_version bigint not null default 1;
alter table public.tracker_fields add column if not exists sync_version bigint not null default 1;
alter table public.tracker_entries add column if not exists sync_version bigint not null default 1;

create or replace function public.advance_tracker_sync_version() returns trigger
language plpgsql set search_path = public as $$
begin new.sync_version := old.sync_version + 1; return new; end;
$$;
do $$ declare t text; begin
  foreach t in array array['trackers','tracker_fields','tracker_entries'] loop
    execute format('drop trigger if exists tracker_sync_version on public.%I',t);
    execute format('create trigger tracker_sync_version before update on public.%I for each row execute function public.advance_tracker_sync_version()',t);
  end loop;
end $$;

-- A field edit invalidates validation performed against an earlier schema.
create or replace function public.touch_tracker_field_schema() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.trackers set updated_at=clock_timestamp()
    where id=case when tg_op='DELETE' then old.tracker_id else new.tracker_id end;
  return null;
end;
$$;
drop trigger if exists tracker_field_schema_version on public.tracker_fields;
create trigger tracker_field_schema_version after insert or update or delete on public.tracker_fields
  for each row execute function public.touch_tracker_field_schema();

create table if not exists public.tracker_sync_receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_json jsonb not null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  primary key(user_id,mutation_id)
);
alter table public.tracker_sync_receipts enable row level security;
drop policy if exists tracker_sync_receipts_owner on public.tracker_sync_receipts;
create policy tracker_sync_receipts_owner on public.tracker_sync_receipts to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.tracker_sync_receipts from anon;
grant select,insert,update,delete on public.tracker_sync_receipts to authenticated;

create table if not exists public.tracker_sync_heads (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  revision bigint not null check(revision>0)
);
alter table public.tracker_sync_heads enable row level security;
drop policy if exists tracker_sync_heads_owner on public.tracker_sync_heads;
create policy tracker_sync_heads_owner on public.tracker_sync_heads to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.tracker_sync_heads from anon;
grant select,insert,update on public.tracker_sync_heads to authenticated;

-- The Node business adapter normalizes input with the existing validators.
-- This public authenticated RPC also validates constraints and field values.
create or replace function public.tracker_sync_v2(p_account uuid,p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  owner_id uuid := auth.uid(); item jsonb; req jsonb; payload jsonb; result jsonb;
  saved public.tracker_sync_receipts%rowtype; current_row jsonb; parent_row public.trackers%rowtype;
  table_name text; resource text; op text; sid bigint; parent_id bigint; version_value bigint;
  results jsonb := '[]'; records jsonb; head_revision bigint; f public.tracker_fields%rowtype; val jsonb; vals jsonb; normalized_vals jsonb;
begin
  if owner_id is null or owner_id<>p_account then raise exception 'Tracker sync account mismatch' using errcode='42501'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations)>50 then raise exception 'Invalid sync batch' using errcode='22023'; end if;
  -- Serializes this account's sync snapshots, including requests from two devices.
  perform pg_advisory_xact_lock(hashtextextended('eo-tracker-sync:'||owner_id::text,0));
  insert into public.tracker_sync_heads(user_id,revision) values(owner_id,1)
    on conflict(user_id) do update set revision=tracker_sync_heads.revision+1 returning revision into head_revision;
  for item in select value from jsonb_array_elements(p_operations) loop
    req:=item->'request'; payload:=item->'input'; resource:=req->>'resourceType'; op:=req->>'operation';
    if resource not in ('tracker','tracker_field','tracker_entry') or op not in ('create','update','delete')
      or coalesce(length(req->>'localId'),0) not between 1 and 100 then raise exception 'Invalid mutation' using errcode='22023'; end if;
    insert into public.tracker_sync_receipts(user_id,mutation_id,request_json)
      values(owner_id,(req->>'mutationId')::uuid,req) on conflict do nothing;
    select * into saved from public.tracker_sync_receipts where user_id=owner_id and mutation_id=(req->>'mutationId')::uuid for update;
    if saved.request_json<>req then
      result:=jsonb_build_object('mutationId',req->>'mutationId','status','rejected','error','mutationId 已用于不同内容');
    elsif saved.result_json is not null then
      result:=saved.result_json;
      if result->>'status'='applied' then result:=result||'{"status":"duplicate"}'; end if;
    else
      result:=jsonb_build_object('mutationId',req->>'mutationId','status','applied');
      table_name:=case resource when 'tracker' then 'trackers' when 'tracker_field' then 'tracker_fields' else 'tracker_entries' end;
      sid:=(req->>'serverId')::bigint; current_row:=null;
      begin
        if op<>'create' then
          execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',table_name) into current_row using sid,owner_id;
          if current_row is null then result:=result||'{"status":"conflict","error":"远端记录已删除"}';
          elsif (current_row->>'sync_version')::bigint is distinct from (req->>'baseVersion')::bigint then result:=result||'{"status":"conflict","error":"远端记录已更新"}'; end if;
        end if;
        if result->>'status'='applied' and resource<>'tracker' then
          parent_id:=coalesce((current_row->>'tracker_id')::bigint,(payload->>'trackerId')::bigint);
          select * into parent_row from public.trackers where id=parent_id and user_id=owner_id for update;
          if not found then result:=result||'{"status":"conflict","error":"所属 Tracker 已删除"}';
          elsif op<>'delete' and parent_row.archived_at is not null then result:=result||'{"status":"rejected","error":"请先恢复已归档的 Tracker"}';
          elsif op<>'delete' and parent_row.sync_version is distinct from (req->>'parentVersion')::bigint then result:=result||'{"status":"conflict","error":"Tracker 属性已更新，请检查记录后重试"}'; end if;
        end if;
        if result->>'status'='applied' and item->>'validationError' is not null then
          result:=result||jsonb_build_object('status','rejected','error',item->>'validationError');
        end if;
        if result->>'status'='applied' then
          -- Validate the public RPC too: never trust arbitrary normalized input.
          if resource='tracker' then
            if op='delete' then raise exception 'PoC 请在 Web 管理 Tracker 删除' using errcode='22023'; end if;
            if op='create' then
              insert into public.trackers(user_id,name,group_name,quick_capture_enabled)
                values(owner_id,payload->>'name',coalesce(nullif(payload->>'groupName',''),'日常'),coalesce((payload->>'quickCaptureEnabled')::boolean,true)) returning id,sync_version into sid,version_value;
            else
              update public.trackers set name=coalesce(payload->>'name',name),group_name=coalesce(payload->>'groupName',group_name),
                quick_capture_enabled=coalesce((payload->>'quickCaptureEnabled')::boolean,quick_capture_enabled)
                where id=sid and user_id=owner_id returning sync_version into version_value;
              update public.reminders set title=payload->>'name' where user_id=owner_id and payload ? 'name'
                and id in (select reminder_id from public.tracker_reminders where tracker_id=sid and user_id=owner_id);
            end if;
          elsif resource='tracker_field' then
            if op<>'create' or payload->>'type' not in ('number','text') then raise exception 'PoC 仅支持新增数值或文本属性，其他配置请在 Web 管理' using errcode='22023'; end if;
            insert into public.tracker_fields(user_id,tracker_id,field_key,name,type,required,default_value,options_json,show_after_quick_capture,include_in_stats,sort_order,unit,precision,config_json)
              values(owner_id,parent_id,(payload->>'key')::uuid::text,payload->>'name',payload->>'type',coalesce((payload->>'required')::boolean,false),null,'[]',false,
                coalesce((payload->>'includeInStats')::boolean,false),coalesce((payload->>'sortOrder')::integer,0),coalesce(payload->>'unit',''),coalesce((payload->>'precision')::integer,0),'{}') returning id,sync_version into sid,version_value;
          elsif op='delete' then
            delete from public.tracker_entries where id=sid and user_id=owner_id;
          else
            vals:=coalesce(payload->'values',current_row->'values_json','{}');
            if jsonb_typeof(vals)<>'object' then raise exception '记录字段必须是对象' using errcode='22023'; end if;
            normalized_vals:='{}';
            for f in select * from public.tracker_fields where tracker_id=parent_id and user_id=owner_id loop
              if f.archived_at is not null then
                if op='update' and (vals ? f.field_key or vals ? f.id::text) then
                  normalized_vals:=normalized_vals||jsonb_build_object(f.field_key,coalesce(vals->f.field_key,vals->f.id::text));
                end if;
                continue;
              end if;
              val:=coalesce(vals->f.field_key,vals->f.id::text,f.default_value);
              if f.required and not(parent_row.quick_capture_enabled and vals='{}') and (val is null or val in ('null','""','[]')) then raise exception '%不能为空',f.name using errcode='22023'; end if;
              if val is null or val in ('null','""') then continue; end if;
              if (f.type='number' and jsonb_typeof(val)<>'number') or (f.type='text' and jsonb_typeof(val)<>'string')
                or (f.type='boolean' and jsonb_typeof(val)<>'boolean')
                or (f.type='rating' and (jsonb_typeof(val)<>'number' or (val#>>'{}')::numeric not between 1 and 5))
                or (f.type='single_select' and not(f.options_json @> jsonb_build_array(val)))
                or (f.type='multi_select' and (jsonb_typeof(val)<>'array' or not(f.options_json @> val))) then raise exception '%格式不正确',f.name using errcode='22023'; end if;
              if f.type='time_range' and (jsonb_typeof(val)<>'object' or (val->>'endAt')::timestamptz<=(val->>'startAt')::timestamptz
                or val->>'startAt' is null or val->>'endAt' is null) then raise exception '%时间段格式不正确',f.name using errcode='22023'; end if;
              if f.type='time_range' then val:=jsonb_set(val,'{durationMinutes}',to_jsonb(extract(epoch from ((val->>'endAt')::timestamptz-(val->>'startAt')::timestamptz))/60)); end if;
              normalized_vals:=normalized_vals||jsonb_build_object(f.field_key,val);
            end loop;
            if op='create' or payload ? 'values' then vals:=normalized_vals; end if;
            if op='create' then
              insert into public.tracker_entries(user_id,tracker_id,occurred_at,values_json,note) values(owner_id,parent_id,(payload->>'occurredAt')::timestamptz,vals,coalesce(payload->>'note','')) returning id,sync_version into sid,version_value;
            else
              update public.tracker_entries set occurred_at=coalesce((payload->>'occurredAt')::timestamptz,occurred_at),values_json=vals,note=coalesce(payload->>'note',note)
                where id=sid and user_id=owner_id returning sync_version into version_value;
            end if;
          end if;
          result:=result||jsonb_build_object('serverId',sid,'version',version_value);
        end if;
      exception when check_violation or not_null_violation or foreign_key_violation or unique_violation or invalid_parameter_value or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        result:=jsonb_build_object('mutationId',req->>'mutationId','status','rejected','error','记录内容不符合当前 Tracker 结构，请检查后重试');
      end;
      update public.tracker_sync_receipts set result_json=result where user_id=owner_id and mutation_id=(req->>'mutationId')::uuid;
    end if;
    results:=results||jsonb_build_array(result);
  end loop;
  -- One statement snapshot: no PostgREST row cap, no missing page interpreted as deletion.
  -- ponytail: full account snapshot for this Tracker PoC; use paginated immutable
  -- bootstrap plus a change log before expanding to other business modules.
  select coalesce(jsonb_agg(r),'[]') into records from (
    select jsonb_build_object('resourceType','tracker','serverId',id,'version',sync_version,'payload',to_jsonb(t)-'user_id'-'sync_version') r from public.trackers t where user_id=owner_id
    union all select jsonb_build_object('resourceType','tracker_field','serverId',id,'version',sync_version,'payload',to_jsonb(t)-'user_id'-'sync_version') from public.tracker_fields t where user_id=owner_id
    union all select jsonb_build_object('resourceType','tracker_entry','serverId',id,'version',sync_version,'payload',to_jsonb(t)-'user_id'-'sync_version') from public.tracker_entries t where user_id=owner_id
  ) snapshot_rows;
  return jsonb_build_object('protocolVersion',2,'accountId',owner_id,'results',results,'snapshot',jsonb_build_object('complete',true,'revision',head_revision,'records',records));
end;
$$;
revoke all on function public.tracker_sync_v2(uuid,jsonb) from public,anon;
grant execute on function public.tracker_sync_v2(uuid,jsonb) to authenticated;
commit;
