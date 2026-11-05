begin;
-- Small shared read markers, not another transcript. Conversation deletion cleans them up.
create table public.hermes_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  seen_seq bigint not null default 0 check(seen_seq>=0),
  primary key(user_id,conversation_id),
  foreign key(conversation_id,user_id) references public.hermes_conversations(id,user_id) on delete cascade
);
alter table public.hermes_reads enable row level security;
create policy owner_read on public.hermes_reads for select to authenticated using(user_id=auth.uid());
revoke all on public.hermes_reads from public,anon,authenticated;
grant select on public.hermes_reads to authenticated;

create function public.eo_hermes_activity(p_action text default 'read',p_data jsonb default '{}') returns jsonb
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
      (select count(*) from (select 1 from public.hermes_messages where user_id=uid and conversation_id=h.id and role='assistant' and seq>coalesce(r.seen_seq,0) limit 100) unread) unread,
      coalesce((select left(content,100) from public.hermes_messages where user_id=uid and conversation_id=h.id order by seq desc limit 1),'') preview,
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
revoke all on function public.eo_hermes_activity(text,jsonb) from public,anon;
grant execute on function public.eo_hermes_activity(text,jsonb) to authenticated;
commit;
