-- Itemized gifts retain direction even when all prices are unknown.
alter table public.relation_events add column if not exists gift_direction text
  check(gift_direction is null or (event_type='gift' and gift_direction in ('out','in')));
alter table public.relation_event_items alter column amount_minor drop not null;

create or replace function public.save_relation_event(p_event_id bigint,p_payload jsonb) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint; p jsonb; i jsonb; f jsonb; v_party_ids jsonb='{}'::jsonb; v_from bigint; v_to bigint; v_total bigint; v_delta bigint; v_coverage bigint; v_advance bigint; v_repaid bigint; v_direction text:=p_payload->>'giftDirection'; v_self_key text; v_person_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_array_length(p_payload->'parties')<2 or (select count(*) from jsonb_array_elements(p_payload->'parties') x where x->>'partyType'='self')<>1 then raise exception 'Exactly one self and at least one person are required'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'parties'))<>(select count(distinct x->>'key') from jsonb_array_elements(p_payload->'parties') x) then raise exception 'Party keys must be unique'; end if;
  if v_direction is not null and (p_payload->>'eventType' is distinct from 'gift' or v_direction not in ('out','in')) then
    raise exception 'Invalid gift direction';
  end if;
  if p_payload->>'eventType'='expense' then
    v_total=(p_payload->>'totalAmountMinor')::bigint;
    if v_total<0 or (select coalesce(sum((x->>'shareAmountMinor')::bigint),0) from jsonb_array_elements(p_payload->'parties') x)<>v_total or (select coalesce(sum((x->>'paidAmountMinor')::bigint),0) from jsonb_array_elements(p_payload->'parties') x)<>v_total then raise exception 'Expense total, shares, and paid amounts must balance'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'items') item where item->>'amountMinor' is null) then raise exception 'Expense items require amounts'; end if;
    if jsonb_array_length(p_payload->'items')>0 and (select coalesce(sum((x->>'amountMinor')::bigint),0) from jsonb_array_elements(p_payload->'items') x)<>v_total then raise exception 'Expense items must sum to total'; end if;
    for p in select * from jsonb_array_elements(p_payload->'parties') loop
      v_delta=(p->>'paidAmountMinor')::bigint-(p->>'shareAmountMinor')::bigint;
      select coalesce(sum(case when x->>'fromKey'=p->>'key' then (x->>'amountMinor')::bigint when x->>'toKey'=p->>'key' then -(x->>'amountMinor')::bigint else 0 end),0) into v_coverage from jsonb_array_elements(p_payload->'flows') x where x->>'flowType' in('advance','treat');
      if v_delta<>v_coverage then raise exception 'Expense coverage does not match payment delta'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(p_payload->'flows') x where x->>'flowType' not in('advance','treat')) then raise exception 'Invalid expense flow type'; end if;
  else
    if p_payload->'totalAmountMinor'<>'null'::jsonb or (v_direction is null and jsonb_array_length(p_payload->'items')>0) or exists(select 1 from jsonb_array_elements(p_payload->'parties') x where x->'shareAmountMinor'<>'null'::jsonb or x->'paidAmountMinor'<>'null'::jsonb) then raise exception 'Non-expense amounts must be null'; end if;
    if p_payload->>'eventType'='interaction' and jsonb_array_length(p_payload->'flows')<>0 then raise exception 'Interaction cannot have value flows'; end if;
    if v_direction is not null then
      v_person_count:=jsonb_array_length(p_payload->'parties')-1;
      if (v_direction='in' and v_person_count<>1) or jsonb_array_length(p_payload->'items')=0 or
         exists(select 1 from jsonb_array_elements(p_payload->'items') item where coalesce(btrim(item->>'label'),'')='') then
        raise exception 'An itemized gift needs named items and a received gift needs one sender';
      end if;
      select x->>'key' into v_self_key from jsonb_array_elements(p_payload->'parties') x where x->>'partyType'='self';
      select coalesce(sum((item->>'amountMinor')::bigint),0) into v_total from jsonb_array_elements(p_payload->'items') item;
      if v_total::numeric*v_person_count>9007199254740991 or
        jsonb_array_length(p_payload->'flows')<>(case when v_total>0 then v_person_count else 0 end) or exists(
        select 1 from jsonb_array_elements(p_payload->'flows') flow
        where (flow->>'amountMinor')::bigint is distinct from v_total or flow->>'settlesFlowId' is not null
          or (case when v_direction='out' then flow->>'fromKey' else flow->>'toKey' end) is distinct from v_self_key
          or not exists(select 1 from jsonb_array_elements(p_payload->'parties') party
            where party->>'partyType'='person' and party->>'key'=(case when v_direction='out' then flow->>'toKey' else flow->>'fromKey' end))
      ) or (v_total>0 and (select count(distinct (case when v_direction='out' then flow->>'toKey' else flow->>'fromKey' end))
          from jsonb_array_elements(p_payload->'flows') flow)<>v_person_count)
      then raise exception 'Gift flow must match its item subtotal and direction'; end if;
    elsif p_payload->>'eventType'<>'interaction' and jsonb_array_length(p_payload->'flows')=0 then
      raise exception 'Value event requires a flow';
    end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'flows') x where x->>'flowType'<>p_payload->>'eventType') then raise exception 'Flow type must match event type'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'flows') x where (x->>'amountMinor')::bigint<=0 or x->>'fromKey'=x->>'toKey') then raise exception 'Flows require positive amounts and distinct parties'; end if;
  for f in select * from jsonb_array_elements(p_payload->'flows') where nullif(value->>'settlesFlowId','') is not null loop
    select amount_minor into v_advance from relation_event_flows where id=(f->>'settlesFlowId')::bigint and user_id=auth.uid() and flow_type='advance';
    if v_advance is null then raise exception 'Repayment can only settle an owned advance'; end if;
    select coalesce(sum(amount_minor),0) into v_repaid from relation_event_flows where settles_flow_id=(f->>'settlesFlowId')::bigint and user_id=auth.uid() and (p_event_id is null or event_id<>p_event_id);
    v_repaid=v_repaid+(select coalesce(sum((x->>'amountMinor')::bigint),0) from jsonb_array_elements(p_payload->'flows') x where x->>'settlesFlowId'=f->>'settlesFlowId');
    if v_repaid>v_advance then raise exception 'Repayment exceeds the advance'; end if;
  end loop;
  if p_event_id is null then
    insert into relation_events(user_id,event_type,title,note,occurred_at,occurred_has_explicit_time,currency,total_amount_minor,is_in_person,gift_direction)
    values(auth.uid(),p_payload->>'eventType',p_payload->>'title',p_payload->>'note',(p_payload->>'occurredAt')::timestamptz,(p_payload->>'occurredHasExplicitTime')::boolean,p_payload->>'currency',nullif(p_payload->>'totalAmountMinor','')::bigint,nullif(p_payload->>'isInPerson','')::boolean,v_direction) returning id into v_id;
  else
    update relation_events set event_type=p_payload->>'eventType',title=p_payload->>'title',note=p_payload->>'note',occurred_at=(p_payload->>'occurredAt')::timestamptz,occurred_has_explicit_time=(p_payload->>'occurredHasExplicitTime')::boolean,currency=p_payload->>'currency',total_amount_minor=nullif(p_payload->>'totalAmountMinor','')::bigint,is_in_person=nullif(p_payload->>'isInPerson','')::boolean,gift_direction=v_direction,updated_at=now()
      where id=p_event_id and user_id=auth.uid() and (gift_direction is null or v_direction is not null) returning id into v_id;
    if v_id is null then
      if v_direction is null and exists(select 1 from relation_events where id=p_event_id and user_id=auth.uid() and gift_direction is not null) then
        raise exception 'This record requires itemized gift input' using errcode='23514';
      end if;
      return null;
    end if;
    delete from relation_event_flows where event_id=v_id; delete from relation_event_items where event_id=v_id; delete from relation_event_parties where event_id=v_id;
  end if;
  for p in select * from jsonb_array_elements(p_payload->'parties') loop
    insert into relation_event_parties(user_id,event_id,party_type,person_id,share_amount_minor,paid_amount_minor) values(auth.uid(),v_id,p->>'partyType',nullif(p->>'personId','')::bigint,nullif(p->>'shareAmountMinor','')::bigint,nullif(p->>'paidAmountMinor','')::bigint) returning id into v_from;
    v_party_ids=jsonb_set(v_party_ids,array[p->>'key'],to_jsonb(v_from));
  end loop;
  for i in select * from jsonb_array_elements(p_payload->'items') loop insert into relation_event_items(user_id,event_id,label,amount_minor,sort_order) values(auth.uid(),v_id,i->>'label',(i->>'amountMinor')::bigint,(i->>'sortOrder')::integer); end loop;
  for f in select * from jsonb_array_elements(p_payload->'flows') loop
    v_from=(v_party_ids->>(f->>'fromKey'))::bigint; v_to=(v_party_ids->>(f->>'toKey'))::bigint;
    insert into relation_event_flows(user_id,event_id,from_party_id,to_party_id,flow_type,amount_minor,settles_flow_id,note) values(auth.uid(),v_id,v_from,v_to,f->>'flowType',(f->>'amountMinor')::bigint,nullif(f->>'settlesFlowId','')::bigint,f->>'note');
  end loop;
  return v_id;
end $$;
