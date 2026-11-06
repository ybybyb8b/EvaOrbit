begin;
create table public.hermes_push_receipts (
  event_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.hermes_messages(id) on delete cascade,
  status text not null check(status in ('pending','processing','sent','skipped','failed')),
  claim_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hermes_push_receipts enable row level security;
create policy hermes_push_owner_read on public.hermes_push_receipts for select to authenticated using(user_id=auth.uid());
grant select on public.hermes_push_receipts to authenticated;

-- Server only. The paired token selects the owner; callers cannot provide an owner,
-- notification body, destination or Bark key.
create function public.hermes_claim_push(p_token text,p_message uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare uid uuid; m public.hermes_messages; parent public.hermes_messages; receipt public.hermes_push_receipts;
  k text; event text; settings public.bark_notification_settings; english boolean;
begin
  if p_claim is null or char_length(p_token) not between 40 and 160 then raise exception 'HERMES_TOKEN'; end if;
  select user_id into uid from public.hermes_connections where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if uid is null then raise exception 'HERMES_TOKEN'; end if;
  select * into m from public.hermes_messages where id=p_message and user_id=uid;
  if not found then return jsonb_build_object('skipped',true); end if;
  if m.role='user' then
    if m.status in ('failed','interrupted') then k:='error';
    elsif m.status='done' then
      select * into m from public.hermes_messages where reply_to=p_message and user_id=uid and role='assistant' and attempt_id=m.attempt_id
        and coalesce(presentation->>'kind','')<>'choices' order by seq desc limit 1;
      if not found then return jsonb_build_object('skipped',true); end if;
      k:='reply';
    else return jsonb_build_object('pending',true); end if;
  elsif m.presentation->>'kind'='choices' then
    if m.presentation->>'state' is distinct from 'pending' then return jsonb_build_object('skipped',true); end if;
    k:='question';
  else
    k:='reply';
    if m.reply_to is not null then
      select * into parent from public.hermes_messages where id=m.reply_to and user_id=uid;
      if not found or parent.attempt_id<>m.attempt_id then return jsonb_build_object('skipped',true); end if;
      if parent.status in ('queued','received','processing') then return jsonb_build_object('pending',true); end if;
      select * into m from public.hermes_messages where reply_to=parent.id and attempt_id=parent.attempt_id and role='assistant'
        and coalesce(presentation->>'kind','')<>'choices' order by seq desc limit 1;
    end if;
  end if;
  if k<>'error' and exists(select 1 from public.hermes_reads where user_id=uid and conversation_id=m.conversation_id and seen_seq>=m.seq) then
    return jsonb_build_object('skipped',true);
  end if;
  event:=k||':'||case when k='reply' then coalesce(m.reply_to,m.id)::text else m.id::text end||':'||m.attempt_id::text;
  insert into public.hermes_push_receipts(event_key,user_id,message_id,status) values(event,uid,m.id,'pending') on conflict do nothing;
  select * into receipt from public.hermes_push_receipts where event_key=event for update;
  if receipt.status in ('sent','skipped','failed') then return jsonb_build_object('skipped',true); end if;
  if receipt.lease_until>now() then return jsonb_build_object('pending',true); end if;
  if receipt.attempts>=5 then
    update public.hermes_push_receipts set status='failed' where event_key=event;
    return jsonb_build_object('skipped',true);
  end if;
  select * into settings from public.bark_notification_settings where user_id=uid;
  if not found or not settings.enabled then
    update public.hermes_push_receipts set status='skipped' where event_key=event;
    return jsonb_build_object('skipped',true);
  end if;
  select ui_language='en' into english from public.ui_preferences where user_id=uid;
  update public.hermes_push_receipts set status='processing',claim_id=p_claim,lease_until=now()+interval '45 seconds',attempts=attempts+1,message_id=m.id where event_key=event;
  return jsonb_build_object('kind',k,'conversationId',m.conversation_id,'content',left(m.content,400),'english',coalesce(english,false),
    'ciphertext',settings.ciphertext,'iv',settings.iv,'authTag',settings.auth_tag,'openInHost',settings.open_in_host,'claim',p_claim);
end $$;
create function public.hermes_finish_push(p_claim uuid,p_success boolean,p_error text default null) returns void
language sql security definer set search_path=public,pg_temp as $$
  update public.hermes_push_receipts set status=case when p_success then 'sent' else 'pending' end,
    sent_at=case when p_success then now() else null end,last_error=case when p_success then null else left(p_error,120) end,
    lease_until=case when p_success then null else now()+interval '30 seconds' end
  where claim_id=p_claim and status='processing';
$$;
revoke all on function public.hermes_claim_push(text,uuid,uuid),public.hermes_finish_push(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.hermes_claim_push(text,uuid,uuid),public.hermes_finish_push(uuid,boolean,text) to service_role;
commit;
