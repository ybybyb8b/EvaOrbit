begin;
-- Presentation only: Hermes remains the session and tool authority. No historical records deleted.
alter table public.hermes_messages add column presentation jsonb not null default '{}'::jsonb
  check(jsonb_typeof(presentation)='object' and octet_length(presentation::text)<=24000);
alter table public.hermes_conversations alter column title set default 'Hermes';
create or replace function public.eo_hermes(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); c public.hermes_connections; m public.hermes_messages;
  cid uuid; mid uuid; prompt public.hermes_messages; decoration jsonb; body text; output jsonb; history jsonb; pending jsonb; before_seq bigint; after_seq bigint;
begin
  if uid is null then raise exception 'HERMES_AUTH'; end if;
  if p_action='pair' then
    if coalesce(p_data->>'hash','') !~ '^[0-9a-f]{64}$' then raise exception 'HERMES_INPUT'; end if;
    insert into public.hermes_connections(user_id,token_hash) values(uid,p_data->>'hash')
      on conflict(user_id) do update set token_hash=excluded.token_hash,instance_id=null,last_seen_at=null;
    update public.hermes_messages set status='interrupted',lease_until=null,error='Connection changed. Check Hermes before retrying.',updated_at=now()
      where user_id=uid and status in ('received','processing');
    return jsonb_build_object('paired',true,'userId',uid);
  elsif p_action='disconnect' then
    update public.hermes_connections set token_hash=null,instance_id=null,last_seen_at=null where user_id=uid;
    update public.hermes_messages set status='interrupted',lease_until=null,error='Connection revoked.',updated_at=now()
      where user_id=uid and status in ('received','processing');
    return jsonb_build_object('paired',false);
  elsif p_action='send' then
    cid:=(p_data->>'conversationId')::uuid; mid:=(p_data->>'id')::uuid; body:=btrim(p_data->>'content');
    if cid is null or mid is null or coalesce(char_length(body),0) not between 1 and 20000 then raise exception 'HERMES_INPUT'; end if;
    select * into m from public.hermes_messages where id=mid and user_id=uid;
    if found then
      if m.conversation_id<>cid or m.content<>body or m.role<>'user' or m.reply_to is distinct from (p_data->>'responseTo')::uuid or (coalesce(m.presentation->>'kind','')='note') is distinct from coalesce((p_data->>'note')::boolean,false) then raise exception 'HERMES_CONFLICT'; end if;
      return to_jsonb(m);
    end if;
    decoration:=case when coalesce((p_data->>'note')::boolean,false) then '{"kind":"note"}'::jsonb else '{}'::jsonb end;
    if p_data->>'responseTo' is not null then
      if coalesce((p_data->>'note')::boolean,false) then raise exception 'HERMES_INPUT'; end if;
      select * into prompt from public.hermes_messages where id=(p_data->>'responseTo')::uuid and user_id=uid and conversation_id=cid and role='assistant' for update;
      if not found or prompt.presentation->>'kind'<>'choices' or prompt.presentation->>'state'<>'pending' then raise exception 'HERMES_PROMPT_EXPIRED'; end if;
      if exists(select 1 from public.hermes_messages where reply_to=prompt.id and role='user' and status not in ('failed','interrupted')) then raise exception 'HERMES_CONFLICT'; end if;
      decoration:=jsonb_build_object('kind','response','promptId',prompt.presentation->>'promptId');
    end if;
    insert into public.hermes_conversations(id,user_id,title) values(cid,uid,left(body,50)) on conflict(id) do nothing;
    if not exists(select 1 from public.hermes_conversations where id=cid and user_id=uid) then raise exception 'HERMES_NOT_FOUND'; end if;
    insert into public.hermes_messages(id,user_id,conversation_id,role,content,status,presentation,reply_to) values(mid,uid,cid,'user',body,'queued',decoration,prompt.id) returning * into m;
    update public.hermes_conversations set updated_at=now() where id=cid and user_id=uid;
    return to_jsonb(m);
  elsif p_action='retry' then
    mid:=(p_data->>'id')::uuid;
    update public.hermes_messages set status='queued',attempt_id=gen_random_uuid(),worker_id=null,lease_until=null,error=null,updated_at=now()
      where id=mid and user_id=uid and role='user' and coalesce(presentation->>'kind','')<>'response' and (status in ('failed','interrupted') or status in ('received','processing') and lease_until<now()) returning * into m;
    if not found then raise exception 'HERMES_STATE'; end if;
    return to_jsonb(m);
  elsif p_action='clear' then
    cid:=(p_data->>'conversationId')::uuid;
    -- Cancel unsent messages, but do not delete the reply destination of a live turn.
    if exists(select 1 from public.hermes_messages where user_id=uid and conversation_id=cid and status in ('received','processing') and lease_until>=now()) then raise exception 'HERMES_BUSY'; end if;
    delete from public.hermes_conversations where id=cid and user_id=uid;
    return jsonb_build_object('cleared',true);
  elsif p_action<>'read' then raise exception 'HERMES_ACTION'; end if;
  select * into c from public.hermes_connections where user_id=uid;
  output:=jsonb_build_object('connection',jsonb_build_object('paired',c.token_hash is not null,'online',coalesce(c.last_seen_at>now()-interval '90 seconds',false),'lastSeenAt',c.last_seen_at),
    'conversations',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (select id,title,created_at,updated_at from public.hermes_conversations where user_id=uid order by updated_at desc limit 50) x),'[]'));
  cid:=(p_data->>'conversationId')::uuid;
  if cid is null then return output||jsonb_build_object('messages','[]'::jsonb,'hasMore',false); end if;
  if not exists(select 1 from public.hermes_conversations where id=cid and user_id=uid) then raise exception 'HERMES_NOT_FOUND'; end if;
  before_seq:=(p_data->>'before')::bigint; after_seq:=(p_data->>'after')::bigint;
  pending:=coalesce(p_data->'pending','[]'::jsonb);
  if jsonb_typeof(pending)<>'array' or jsonb_array_length(pending)>100 then raise exception 'HERMES_INPUT'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.seq),'[]') into history from (
    select id,seq,conversation_id,role,content,
      case when status in ('received','processing') and lease_until<now() then 'interrupted' else status end status,
      attempt_id,reply_to,error,created_at,updated_at,presentation
    from public.hermes_messages where user_id=uid and conversation_id=cid
      and (before_seq is null or seq<before_seq)
      and (after_seq is null or seq>after_seq or id::text in (select jsonb_array_elements_text(pending)))
    order by seq desc limit 100
  ) x;
  return output||jsonb_build_object('messages',history,'hasMore',jsonb_array_length(history)=100);
end $$;
revoke all on function public.eo_hermes(text,jsonb) from public,anon;
grant execute on function public.eo_hermes(text,jsonb) to authenticated;

create or replace function public.hermes_bridge(p_token text,p_instance uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.hermes_connections; m public.hermes_messages; cid uuid; mid uuid; attempt uuid; body text; state text;
begin
  if p_instance is null or char_length(p_token) not between 40 and 100 then raise exception 'HERMES_TOKEN'; end if;
  select * into c from public.hermes_connections where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise exception 'HERMES_TOKEN'; end if;
  if p_action='hello' then
    if c.instance_id is not null and c.instance_id<>p_instance and c.last_seen_at>now()-interval '90 seconds' then raise exception 'HERMES_CONNECTED'; end if;
    if c.instance_id is distinct from p_instance then
      update public.hermes_messages set presentation=jsonb_set(presentation,'{state}','"expired"'),updated_at=now()
        where user_id=c.user_id and role='assistant' and presentation->>'state'='pending';
    end if;
    update public.hermes_connections set instance_id=p_instance,last_seen_at=now() where user_id=c.user_id;
    return jsonb_build_object('userId',c.user_id);
  end if;
  if p_action<>'deliver' and c.instance_id is distinct from p_instance then raise exception 'HERMES_INSTANCE'; end if;
  if p_action='bye' then
    update public.hermes_connections set last_seen_at=null,instance_id=null where user_id=c.user_id;
    return 'null';
  elsif p_action='heartbeat' then
    update public.hermes_connections set last_seen_at=now() where user_id=c.user_id;
    update public.hermes_messages set lease_until=now()+interval '2 minutes' where user_id=c.user_id and worker_id=p_instance and status in ('received','processing');
    return 'null';
  elsif p_action='claim' then
    update public.hermes_messages set status='interrupted',error='Hermes stopped before completion. Check local history before retrying.',updated_at=now()
      where user_id=c.user_id and status in ('received','processing') and (lease_until<now() or worker_id is distinct from p_instance);
    select * into m from public.hermes_messages q where q.user_id=c.user_id and q.role='user' and q.status='queued'
      and (q.presentation->>'kind'='response' or not exists(select 1 from public.hermes_messages busy where busy.conversation_id=q.conversation_id and busy.status in ('received','processing')))
      order by q.seq limit 1 for update skip locked;
    if not found then return 'null'; end if;
    update public.hermes_messages set status='received',worker_id=p_instance,lease_until=now()+interval '2 minutes',updated_at=now() where id=m.id returning * into m;
    return to_jsonb(m);
  elsif p_action='retire' then
    update public.hermes_messages set presentation=jsonb_set(presentation,'{state}','"expired"'),updated_at=now()
      where user_id=c.user_id and role='assistant' and presentation->>'promptId'=p_data->>'promptId' and presentation->>'state'='pending';
    return 'null';
  elsif p_action in ('send','deliver') then
    cid:=(p_data->>'conversationId')::uuid; mid:=(p_data->>'id')::uuid; body:=p_data->>'content';
    if p_data ? 'presentation' and (jsonb_typeof(p_data->'presentation')<>'object' or octet_length((p_data->'presentation')::text)>24000
      or coalesce(p_data->'presentation'->>'kind','') not in ('','choices')
      or (p_data->'presentation'->>'kind'='choices' and (coalesce(p_data->'presentation'->>'state','')<>'pending' or coalesce(p_data->'presentation'->>'promptId','')='' or jsonb_typeof(p_data->'presentation'->'options') is distinct from 'array' or jsonb_array_length(p_data->'presentation'->'options')>20))) then raise exception 'HERMES_INPUT'; end if;
    if mid is null or coalesce(char_length(body),0) not between 1 and 32000 then raise exception 'HERMES_INPUT'; end if;
    if not exists(select 1 from public.hermes_conversations where id=cid and user_id=c.user_id) then raise exception 'HERMES_NOT_FOUND'; end if;
    if p_data->>'replyTo' is not null then
      select * into m from public.hermes_messages where id=(p_data->>'replyTo')::uuid and user_id=c.user_id and conversation_id=cid and role='user';
      if not found or m.attempt_id is distinct from (p_data->>'attemptId')::uuid then raise exception 'HERMES_ATTEMPT'; end if;
    end if;
    insert into public.hermes_messages(id,user_id,conversation_id,role,content,status,reply_to,attempt_id,presentation)
      values(mid,c.user_id,cid,'assistant',body,'done',m.id,coalesce(m.attempt_id,gen_random_uuid()),coalesce(p_data->'presentation','{}'::jsonb)) on conflict(id) do nothing;
    if not exists(select 1 from public.hermes_messages where id=mid and user_id=c.user_id and conversation_id=cid and role='assistant' and content=body) then raise exception 'HERMES_CONFLICT'; end if;
    update public.hermes_conversations set updated_at=now() where id=cid and user_id=c.user_id;
    return jsonb_build_object('id',mid);
  end if;
  mid:=(p_data->>'id')::uuid; attempt:=(p_data->>'attemptId')::uuid;
  select * into m from public.hermes_messages where id=mid and user_id=c.user_id and role='user' and attempt_id=attempt for update;
  if not found then raise exception 'HERMES_ATTEMPT'; end if;
  if p_action='responded' then
    if m.presentation->>'kind' is distinct from 'response' or m.worker_id is distinct from p_instance then raise exception 'HERMES_STATE'; end if;
    if m.status in ('done','failed') then return 'null'; end if;
    if m.status<>'received' then raise exception 'HERMES_STATE'; end if;
    update public.hermes_messages set status=case when p_data->>'accepted'='true' then 'done' else 'failed' end,
      error=case when p_data->>'accepted'='true' then null else 'This question has expired. Send a new message to Hermes.' end,lease_until=null,updated_at=now() where id=m.id;
    update public.hermes_messages set presentation=jsonb_set(presentation,'{state}',to_jsonb(case when p_data->>'accepted'='true' then 'answered'::text else 'expired'::text end)),updated_at=now()
      where id=m.reply_to and user_id=c.user_id and presentation->>'kind'='choices';
    return 'null';
  elsif p_action='start' then
    if m.worker_id<>p_instance or m.status<>'received' then raise exception 'HERMES_STATE'; end if;
    update public.hermes_messages set status='processing',updated_at=now() where id=m.id;
  elsif p_action='complete' then
    state:=p_data->>'outcome';
    if coalesce(state,'') not in ('success','failure','cancelled') then raise exception 'HERMES_INPUT'; end if;
    update public.hermes_messages set status=case when state='success' and exists(select 1 from public.hermes_messages where reply_to=m.id and attempt_id=attempt and role='assistant') then 'done' when state='cancelled' then 'interrupted' else 'failed' end,
      error=case when state='success' and exists(select 1 from public.hermes_messages where reply_to=m.id and attempt_id=attempt and role='assistant') then null else left(coalesce(p_data->>'error','No completed reply was confirmed. Check the local Hermes log before retrying.'),700) end,
      lease_until=null,updated_at=now() where id=m.id;
  else raise exception 'HERMES_ACTION'; end if;
  return 'null';
end $$;
revoke all on function public.hermes_bridge(text,uuid,text,jsonb) from public;
-- The high-entropy, revocable connection token is the only bridge credential.
grant execute on function public.hermes_bridge(text,uuid,text,jsonb) to anon,authenticated;
commit;
