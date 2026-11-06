begin;
-- Preserve the submitted text byte-for-byte. The original send time remains created_at.
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
    cid:=(p_data->>'conversationId')::uuid; mid:=(p_data->>'id')::uuid; body:=p_data->>'content';
    if cid is null or mid is null or coalesce(char_length(body),0) not between 1 and 20000 or body !~ '[^[:space:]]' then raise exception 'HERMES_INPUT'; end if;
    select * into m from public.hermes_messages where id=mid and user_id=uid;
    if found then
      if m.conversation_id<>cid or m.content<>body or m.role<>'user' or m.reply_to is distinct from (p_data->>'responseTo')::uuid or (coalesce(m.presentation->>'kind','')='note') is distinct from coalesce((p_data->>'note')::boolean,false) then raise exception 'HERMES_CONFLICT'; end if;
      return to_jsonb(m);
    end if;
    decoration:=case when coalesce((p_data->>'note')::boolean,false) then '{"kind":"note"}'::jsonb else '{}'::jsonb end;
    if decoration='{}'::jsonb and p_data->>'responseTo' is null and exists(
      select 1 from public.hermes_connections conn cross join lateral jsonb_array_elements(conn.commands) cmd
      where conn.user_id=uid and (lower(substring(regexp_replace(body,'^[[:space:]]+','') from '^/([A-Za-z0-9_-]+)(?:\s|$)'))=cmd->>'name'
        or cmd->'aliases' ? lower(substring(regexp_replace(body,'^[[:space:]]+','') from '^/([A-Za-z0-9_-]+)(?:\s|$)')))
    ) then decoration:='{"kind":"command"}'::jsonb; end if;
    if p_data->>'responseTo' is not null then
      if coalesce((p_data->>'note')::boolean,false) then raise exception 'HERMES_INPUT'; end if;
      select * into prompt from public.hermes_messages where id=(p_data->>'responseTo')::uuid and user_id=uid and conversation_id=cid and role='assistant' for update;
      if not found or prompt.presentation->>'kind'<>'choices' or prompt.presentation->>'state'<>'pending' then raise exception 'HERMES_PROMPT_EXPIRED'; end if;
      if exists(select 1 from public.hermes_messages where reply_to=prompt.id and role='user' and status not in ('failed','interrupted')) then raise exception 'HERMES_CONFLICT'; end if;
      decoration:=jsonb_build_object('kind','response','promptId',prompt.presentation->>'promptId');
    end if;
    insert into public.hermes_conversations(id,user_id,title) values(cid,uid,left(regexp_replace(body,'^[[:space:]]+',''),50)) on conflict(id) do nothing;
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
  output:=jsonb_build_object('connection',jsonb_build_object('paired',c.token_hash is not null,'online',coalesce(c.last_seen_at>now()-interval '90 seconds',false),'lastSeenAt',c.last_seen_at,'commands',c.commands),
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

-- Timeline notices do not count as unread replies or replace their preview.
create or replace function public.eo_hermes_activity(p_action text default 'read',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid; marker bigint; result jsonb; c public.hermes_connections;
begin
  if uid is null then raise exception 'HERMES_AUTH'; end if;
  if p_action='seen' then
    cid:=(p_data->>'conversationId')::uuid;marker:=(p_data->>'seq')::bigint;
    if marker is null or marker<0 or not exists(select 1 from public.hermes_conversations where id=cid and user_id=uid) then raise exception 'HERMES_INPUT'; end if;
    -- A client cannot acknowledge future messages or a different account's sequence.
    if marker>0 and not exists(select 1 from public.hermes_messages where user_id=uid and conversation_id=cid and seq=marker) then raise exception 'HERMES_INPUT'; end if;
    insert into public.hermes_reads(user_id,conversation_id,seen_seq) values(uid,cid,marker)
      on conflict(user_id,conversation_id) do update set seen_seq=greatest(hermes_reads.seen_seq,excluded.seen_seq);
    return jsonb_build_object('seen',true);
  elsif p_action<>'read' then raise exception 'HERMES_ACTION'; end if;
  select * into c from public.hermes_connections where user_id=uid;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc),'[]') into result from (
    select h.id,h.title,h.updated_at,
      coalesce((select max(seq) from public.hermes_messages where user_id=uid and conversation_id=h.id),0) "latestSeq",
      (select count(*) from (select 1 from public.hermes_messages where user_id=uid and conversation_id=h.id and role='assistant' and presentation->>'notice' is distinct from 'true' and seq>coalesce(r.seen_seq,0) limit 100) unread) unread,
      coalesce((select left(content,100) from public.hermes_messages where user_id=uid and conversation_id=h.id and presentation->>'notice' is distinct from 'true' order by seq desc limit 1),'') preview,
      (select status from public.hermes_messages where user_id=uid and conversation_id=h.id and role='user' and status in ('queued','received','processing') and (lease_until is null or lease_until>=now()) order by seq limit 1) pending,
      exists(select 1 from public.hermes_messages where user_id=uid and conversation_id=h.id and role='assistant' and presentation->>'state'='pending') question,
      (select coalesce(error,'Hermes stopped before confirming completion.') from public.hermes_messages
        where user_id=uid and conversation_id=h.id and role='user' and seq>coalesce(r.seen_seq,0)
          and (status in ('failed','interrupted') or status in ('received','processing') and lease_until<now()) order by seq desc limit 1) error
    from (select * from public.hermes_conversations where user_id=uid order by updated_at desc limit 50) h
    left join public.hermes_reads r on r.user_id=uid and r.conversation_id=h.id
  ) t;
  return jsonb_build_object('connection',jsonb_build_object('paired',c.token_hash is not null,'online',coalesce(c.last_seen_at>now()-interval '90 seconds',false),'lastSeenAt',c.last_seen_at),'threads',result,
    'receipt',(select jsonb_build_object('id',id,'status',status) from public.hermes_messages where user_id=uid and role='user' and id=(p_data->>'receiptId')::uuid));
end $$;
commit;
