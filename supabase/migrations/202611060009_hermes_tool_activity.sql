begin;

create function public.hermes_bridge_tools(p_token text,p_instance uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  connection public.hermes_connections;
  message public.hermes_messages;
  activity jsonb := p_data->'toolActivity';
  revision integer;
begin
  if coalesce(p_action,'') not in ('tools','complete') then raise exception 'HERMES_ACTION'; end if;
  select * into connection from public.hermes_connections
    where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise exception 'HERMES_TOKEN'; end if;
  if p_instance is null or connection.instance_id is distinct from p_instance then raise exception 'HERMES_INSTANCE'; end if;

  select * into message from public.hermes_messages
    where id=(p_data->>'id')::uuid and user_id=connection.user_id and role='user'
      and attempt_id=(p_data->>'attemptId')::uuid and (p_action='complete' or worker_id=p_instance) for update;
  if not found then raise exception 'HERMES_ATTEMPT'; end if;

  if jsonb_typeof(activity) is distinct from 'object' or octet_length(activity::text)>4096
    or jsonb_typeof(activity->'tools') is distinct from 'array'
    or coalesce(activity->>'revision','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(activity->>'total','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(activity->>'running','') !~ '^[0-9]{1,9}$'
    or coalesce(activity->>'failed','') !~ '^[0-9]{1,9}$' then raise exception 'HERMES_INPUT'; end if;
  if jsonb_array_length(activity->'tools')>12 or exists (
    select 1 from jsonb_array_elements(activity->'tools') tool
    where coalesce(tool->>'name','') !~ '^[A-Za-z0-9_-]{1,64}$'
      or coalesce(tool->>'count','') !~ '^[1-9][0-9]{0,8}$'
  ) then raise exception 'HERMES_INPUT'; end if;
  revision := (activity->>'revision')::integer;

  if message.status in ('received','processing') and
    (message.presentation->'toolActivity'->>'attemptId' is distinct from message.attempt_id::text
      or coalesce((message.presentation->'toolActivity'->>'revision')::integer,0)<revision) then
    update public.hermes_messages set
      presentation=jsonb_set(presentation,'{toolActivity}',jsonb_build_object(
        'attemptId',message.attempt_id,'revision',revision,'total',(activity->>'total')::integer,
        'running',(activity->>'running')::integer,'failed',(activity->>'failed')::integer,
        'tools',(select coalesce(jsonb_agg(jsonb_build_object('name',tool->>'name','count',(tool->>'count')::integer) order by position),'[]'::jsonb)
          from jsonb_array_elements(activity->'tools') with ordinality as rows(tool,position))
      )),
      updated_at=now()
      where id=message.id;
  end if;
  if p_action='complete' then
    return public.hermes_bridge(p_token,p_instance,p_action,p_data-'toolActivity');
  end if;
  return 'null';
end $$;

revoke all on function public.hermes_bridge_tools(text,uuid,text,jsonb) from public;
grant execute on function public.hermes_bridge_tools(text,uuid,text,jsonb) to anon,authenticated;
commit;
