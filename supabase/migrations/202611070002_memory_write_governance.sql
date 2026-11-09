begin;

-- Retain legacy rows. New writes and reviews use the stricter contract.
alter table public.memory_fact_candidates
  add column review_mode text not null default 'manual' check(review_mode in ('manual','user_confirmed')),
  add column review_client text,
  add column written_by text,
  add column actor text,
  add column client text,
  add column request_id uuid;
create unique index idx_memory_candidates_request on public.memory_fact_candidates(user_id,request_id) where request_id is not null;

create index idx_memory_candidates_fact on public.memory_fact_candidates(user_id,promoted_fact_id);

create function public.memory_source_has_evidence(p_resource text,p_record text,p_url text,p_excerpt text)
returns boolean language sql immutable set search_path='' as $$
  select case lower(regexp_replace(coalesce(p_resource,''),'^[[:space:]]+|[[:space:]]+$','','g'))
    when 'chat' then coalesce(p_excerpt ~ '[^[:space:]]',false)
    when 'external' then coalesce(p_record ~ '[^[:space:]]',false) or coalesce(p_url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$' ,false)
    else coalesce(p_record ~ '[^[:space:]]',false) or coalesce(p_url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$',false)
  end
$$;

create function public.validate_memory_source(p_source jsonb)
returns void language plpgsql set search_path='' as $$
declare v_key text; v_text text;
begin
  if jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Source must be an object'; end if;
  foreach v_key in array array['sourceResource','sourceRecordId','sourceUrl','excerpt','note'] loop
    if p_source?v_key and p_source->v_key<>'null'::jsonb and jsonb_typeof(p_source->v_key)<>'string' then raise exception 'Source fields must be strings'; end if;
    v_text:=p_source->>v_key;
    if v_text is not null and (not (v_text ~ '[^[:space:]]') or char_length(v_text)>case v_key when 'sourceResource' then 100 when 'sourceRecordId' then 300 when 'sourceUrl' then 2000 when 'excerpt' then 10000 else 2000 end) then raise exception 'Source field is blank or too long'; end if;
  end loop;
  if coalesce(btrim(p_source->>'sourceResource'),'')='' then raise exception 'sourceResource required'; end if;
  if p_source->>'sourceUrl' is not null and not (p_source->>'sourceUrl' ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$') then raise exception 'Source URL must be HTTP or HTTPS'; end if;
  if not public.memory_source_has_evidence(p_source->>'sourceResource',p_source->>'sourceRecordId',p_source->>'sourceUrl',p_source->>'excerpt') then raise exception 'Source requires evidence; chat requires an original excerpt; external requires a URL or record ID'; end if;
end $$;

create function public.validate_memory_candidate(p_fact jsonb,p_sources jsonb,p_mode text,p_by text,p_writer text,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_key text; v_source jsonb; v_id uuid; v_subject uuid; v_object uuid; v_perspective uuid; v_date date; v_old public.memory_facts%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_fact) is distinct from 'object' or jsonb_typeof(p_sources) is distinct from 'array' then raise exception 'Candidate requires a Fact object and Sources array'; end if;
  if jsonb_array_length(p_sources) not between 1 and 50 then raise exception 'Provide 1 to 50 Sources'; end if;
  if p_mode not in ('manual','user_confirmed') or p_mode is null or p_by not in ('user','model','system','import') or p_by is null then raise exception 'Invalid review mode or proposer'; end if;
  if coalesce(char_length(btrim(p_fact->>'predicate')),0) not between 1 and 120 or jsonb_typeof(p_fact->'predicate') is distinct from 'string' then raise exception 'Invalid predicate'; end if;
  foreach v_key in array array['subjectEntityId','objectEntityId','perspectiveEntityId','supersedesFactId'] loop
    if p_fact?v_key and p_fact->v_key<>'null'::jsonb and jsonb_typeof(p_fact->v_key)<>'string' then raise exception 'Entity and Fact IDs must be UUID strings'; end if;
  end loop;
  v_subject:=(p_fact->>'subjectEntityId')::uuid;
  v_object:=(p_fact->>'objectEntityId')::uuid;
  v_perspective:=(p_fact->>'perspectiveEntityId')::uuid;
  if v_subject is null then raise exception 'Subject required'; end if;
  if (v_object is null) = (coalesce(p_fact->'objectValue','null'::jsonb)='null'::jsonb) then raise exception 'Exactly one object required'; end if;
  if char_length((p_fact->'objectValue')::text)>20000 then raise exception 'Object too large'; end if;
  if coalesce(p_fact->>'epistemicType','unknown') not in ('direct_statement','recorded_observation','derived','agent_judgment','external_report','unknown') then raise exception 'Invalid epistemic type'; end if;
  if p_fact?'confidence' and (jsonb_typeof(p_fact->'confidence')<>'number' or (p_fact->>'confidence')::numeric not between 0 and 1) then raise exception 'Invalid confidence'; end if;
  if p_fact?'importance' and (jsonb_typeof(p_fact->'importance')<>'number' or (p_fact->>'importance')::numeric not between 1 and 5 or mod((p_fact->>'importance')::numeric,1)<>0) then raise exception 'Invalid importance'; end if;
  foreach v_key in array array['validFrom','validTo'] loop
    if p_fact->>v_key is not null then
      if p_fact->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Full date required'; end if;
      v_date:=(p_fact->>v_key)::date;
    end if;
  end loop;
  if (p_fact->>'validTo')::date < (p_fact->>'validFrom')::date then raise exception 'Invalid validity range'; end if;
  for v_id in select distinct value from unnest(array[v_subject,v_object,v_perspective]) value where value is not null order by value loop
    perform 1 from public.memory_entities where user_id=auth.uid() and id=v_id and status='active' for share;
    if not found then raise exception 'Memory Entity is missing or inactive'; end if;
  end loop;
  if p_fact->>'supersedesFactId' is not null then
    select * into v_old from public.memory_facts where id=(p_fact->>'supersedesFactId')::uuid and user_id=auth.uid() for update;
    if v_old.id is null or v_old.status<>'active' or v_old.id=(p_fact->>'id')::uuid then raise exception 'Superseded Fact missing, inactive, or self-referential'; end if;
    if v_old.subject_entity_id<>v_subject or v_old.predicate<>p_fact->>'predicate' or v_old.perspective_entity_id is distinct from v_perspective then raise exception 'Correction must match subject, predicate and perspective'; end if;
    if exists(select 1 from public.memory_facts where user_id=auth.uid() and supersedes_fact_id=v_old.id) then raise exception 'Fact already has a replacement'; end if;
  end if;
  for v_source in select value from jsonb_array_elements(p_sources) loop
    perform public.validate_memory_source(v_source);
  end loop;
  if p_writer is not null and (btrim(p_writer)='' or char_length(p_writer)>200) then raise exception 'Invalid written_by'; end if;
  if p_mode='user_confirmed' and (
      coalesce(p_fact->>'epistemicType','unknown')<>'direct_statement' or p_by<>'user' or p_request is null or coalesce(btrim(p_writer),'')=''
      or not exists(select 1 from jsonb_array_elements(p_sources) s where lower(regexp_replace(s->>'sourceResource','^[[:space:]]+|[[:space:]]+$','','g'))='chat' and coalesce((s->>'excerpt') ~ '[^[:space:]]',false))) then
    raise exception 'user_confirmed requires direct_statement, original user excerpt, written_by and request_id';
  end if;
end $$;

create or replace function public.write_memory_fact(p_fact jsonb,p_sources jsonb,p_superseded_fact_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_fact_id uuid:=(p_fact->>'id')::uuid; v_source jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':memory-lifecycle',0));
  perform public.validate_memory_candidate(p_fact,p_sources,'manual','system',null,null);
  if p_superseded_fact_id is distinct from (p_fact->>'supersedesFactId')::uuid then raise exception 'Replacement lineage mismatch'; end if;
  insert into public.memory_facts(id,user_id,subject_entity_id,predicate,object_entity_id,object_value,perspective_entity_id,epistemic_type,supersedes_fact_id,confidence,importance,valid_from,valid_to,status)
  values(v_fact_id,v_user,(p_fact->>'subjectEntityId')::uuid,p_fact->>'predicate',(p_fact->>'objectEntityId')::uuid,nullif(p_fact->'objectValue','null'::jsonb),(p_fact->>'perspectiveEntityId')::uuid,coalesce(p_fact->>'epistemicType','unknown'),p_superseded_fact_id,coalesce((p_fact->>'confidence')::numeric,1),coalesce((p_fact->>'importance')::smallint,3),(p_fact->>'validFrom')::date,(p_fact->>'validTo')::date,'active');
  for v_source in select value from jsonb_array_elements(p_sources) loop
    insert into public.memory_sources(id,user_id,fact_id,source_resource,source_record_id,source_url,excerpt,note)
    values((v_source->>'id')::uuid,v_user,v_fact_id,v_source->>'sourceResource',v_source->>'sourceRecordId',v_source->>'sourceUrl',v_source->>'excerpt',v_source->>'note');
  end loop;
  if p_superseded_fact_id is not null then
    update public.memory_facts set status='invalidated',invalidated_at=now(),invalidation_reason='superseded' where id=p_superseded_fact_id and user_id=v_user;
  end if;
  return v_fact_id;
end $$;

create or replace function public.promote_memory_fact_candidate(p_candidate_id uuid,p_fact_id uuid,p_source_ids uuid[],p_review_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_candidate public.memory_fact_candidates%rowtype; v_sources jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-lifecycle',0));
  select * into v_candidate from public.memory_fact_candidates where id=p_candidate_id and user_id=auth.uid() and status='pending' for update;
  if v_candidate.id is null then return null; end if;
  perform public.validate_memory_candidate(v_candidate.proposed_fact,v_candidate.proposed_sources,v_candidate.review_mode,v_candidate.proposed_by,v_candidate.written_by,v_candidate.request_id);
  if coalesce(array_length(p_source_ids,1),0)<>jsonb_array_length(v_candidate.proposed_sources) then raise exception 'Incomplete Source IDs'; end if;
  select jsonb_agg(value||jsonb_build_object('id',p_source_ids[ordinality])) into v_sources from jsonb_array_elements(v_candidate.proposed_sources) with ordinality;
  perform public.write_memory_fact(v_candidate.proposed_fact||jsonb_build_object('id',p_fact_id),v_sources,(v_candidate.proposed_fact->>'supersedesFactId')::uuid);
  update public.memory_fact_candidates set status='promoted',review_note=p_review_note,promoted_fact_id=p_fact_id,reviewed_at=now() where id=p_candidate_id and user_id=auth.uid();
  return p_fact_id;
end $$;

create function public.submit_memory_fact_candidate(p_id uuid,p_fact jsonb,p_sources jsonb,p_proposed_by text,p_proposer_model text,p_review_mode text,p_written_by text,p_client text,p_request_id uuid)
returns public.memory_fact_candidates language plpgsql security definer set search_path='' as $$
declare v_row public.memory_fact_candidates%rowtype; v_source_ids uuid[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-lifecycle',0));
  if p_request_id is null or coalesce(btrim(p_client),'')='' or char_length(p_client)>200 then raise exception 'Client and request_id required'; end if;
  select * into v_row from public.memory_fact_candidates where user_id=auth.uid() and request_id=p_request_id;
  if v_row.id is not null then
    if v_row.proposed_fact is distinct from p_fact or v_row.proposed_sources is distinct from p_sources or
       v_row.proposed_by is distinct from p_proposed_by or v_row.proposer_model is distinct from p_proposer_model or
       v_row.review_mode is distinct from p_review_mode or v_row.written_by is distinct from coalesce(p_written_by,auth.uid()::text) or v_row.client is distinct from p_client then raise exception 'request_id was already used for different content'; end if;
    return v_row;
  end if;
  perform public.validate_memory_candidate(p_fact,p_sources,p_review_mode,p_proposed_by,p_written_by,p_request_id);
  if p_proposer_model is not null and char_length(p_proposer_model)>200 then raise exception 'Model name too long'; end if;
  insert into public.memory_fact_candidates(id,user_id,proposed_fact,proposed_sources,proposed_by,proposer_model,review_mode,written_by,actor,client,request_id)
  values(p_id,auth.uid(),p_fact,p_sources,p_proposed_by,p_proposer_model,p_review_mode,coalesce(p_written_by,auth.uid()::text),auth.uid()::text,p_client,p_request_id);
  if p_review_mode='user_confirmed' then
    select array_agg(gen_random_uuid()) into v_source_ids from jsonb_array_elements(p_sources);
    perform public.promote_memory_fact_candidate(p_id,gen_random_uuid(),v_source_ids,null);
    update public.memory_fact_candidates set review_client=p_client where id=p_id and user_id=auth.uid();
  end if;
  select * into v_row from public.memory_fact_candidates where id=p_id and user_id=auth.uid();
  return v_row;
end $$;

create function public.review_memory_fact_candidate(p_id uuid,p_action text,p_note text default null,p_client text default 'web')
returns public.memory_fact_candidates language plpgsql security definer set search_path='' as $$
declare v_row public.memory_fact_candidates%rowtype; v_source_ids uuid[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-lifecycle',0));
  select * into v_row from public.memory_fact_candidates where id=p_id and user_id=auth.uid() and status='pending' for update;
  if v_row.id is null then return null; end if;
  if coalesce(btrim(p_client),'')='' or char_length(p_client)>200 then raise exception 'Review client required'; end if;
  if p_action='promote' then
    select array_agg(gen_random_uuid()) into v_source_ids from jsonb_array_elements(v_row.proposed_sources);
    perform public.promote_memory_fact_candidate(p_id,gen_random_uuid(),v_source_ids,p_note);
  elsif p_action='reject' then
    update public.memory_fact_candidates set status='rejected',review_note=p_note,reviewed_at=now() where id=p_id and user_id=auth.uid();
  else raise exception 'Action must be promote or reject';
  end if;
  update public.memory_fact_candidates set review_client=p_client where id=p_id and user_id=auth.uid();
  select * into v_row from public.memory_fact_candidates where id=p_id and user_id=auth.uid();
  return v_row;
end $$;

create function public.guard_memory_source_evidence()
returns trigger language plpgsql set search_path='' as $$
begin
  -- Compare values so a PATCH that repeats an evidence field still permits a note edit.
  if tg_op = 'UPDATE' then
    if row(new.source_resource, new.source_record_id, new.source_url, new.excerpt)
       is not distinct from row(old.source_resource, old.source_record_id, old.source_url, old.excerpt) then
      return new;
    end if;
  end if;
  perform public.validate_memory_source(jsonb_build_object('sourceResource',new.source_resource,'sourceRecordId',new.source_record_id,'sourceUrl',new.source_url,'excerpt',new.excerpt,'note',new.note));
  return new;
end $$;
create trigger memory_sources_evidence before insert or update on public.memory_sources for each row execute function public.guard_memory_source_evidence();

create function public.delete_memory_source(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_source public.memory_sources%rowtype; v_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_source from public.memory_sources where id=p_id and user_id=auth.uid();
  if v_source.id is null then return false; end if;
  -- A row-version touch also prevents stale-snapshot deletes at REPEATABLE READ.
  update public.memory_facts set updated_at=updated_at where id=v_source.fact_id and user_id=auth.uid() returning status into v_status;
  if v_status='active' and public.memory_source_has_evidence(v_source.source_resource,v_source.source_record_id,v_source.source_url,v_source.excerpt) and not exists(
    select 1 from public.memory_sources where user_id=auth.uid() and fact_id=v_source.fact_id and id<>p_id
    and public.memory_source_has_evidence(source_resource,source_record_id,source_url,excerpt)) then
    raise exception 'Cannot delete the last valid Source of an active Memory Fact';
  end if;
  delete from public.memory_sources where id=p_id and user_id=auth.uid();
  return found;
end $$;

create or replace function public.restore_memory_fact(p_fact_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-lifecycle',0));
  perform 1 from public.memory_facts where id=p_fact_id and user_id=auth.uid() and status='invalidated' for update;
  if not found then return false; end if;
  if exists(
    with recursive successors(id) as (
      select id from public.memory_facts where user_id=auth.uid() and supersedes_fact_id=p_fact_id
      union select f.id from public.memory_facts f join successors s on f.supersedes_fact_id=s.id where f.user_id=auth.uid()
    ), predecessors(id) as (
      select supersedes_fact_id from public.memory_facts where user_id=auth.uid() and id=p_fact_id
      union select f.supersedes_fact_id from public.memory_facts f join predecessors p on f.id=p.id where f.user_id=auth.uid()
    ) select 1 from public.memory_facts where user_id=auth.uid() and status='active'
      and (id in(select id from successors) or id in(select id from predecessors))
  ) then raise exception 'Fact has an active Fact in its replacement chain'; end if;
  if not exists(select 1 from public.memory_sources where user_id=auth.uid() and fact_id=p_fact_id and public.memory_source_has_evidence(source_resource,source_record_id,source_url,excerpt)) then raise exception 'Attach a valid Source before restoring'; end if;
  update public.memory_facts set status='active',invalidated_at=null,invalidation_reason=null where id=p_fact_id and user_id=auth.uid();
  return found;
end $$;

create function public.invalidate_memory_fact(p_id uuid,p_reason text default null)
returns public.memory_facts language plpgsql security definer set search_path='' as $$
declare v_row public.memory_facts%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-lifecycle',0));
  update public.memory_facts set status='invalidated',invalidated_at=now(),invalidation_reason=p_reason where id=p_id and user_id=auth.uid() and status='active' returning * into v_row;
  return v_row;
end $$;

revoke all on public.memory_facts,public.memory_fact_candidates from public,anon,authenticated;
revoke update(confidence,importance,valid_from,valid_to,status,invalidated_at,invalidation_reason) on public.memory_facts from public,anon,authenticated;
revoke update(status,review_note,promoted_fact_id,reviewed_at) on public.memory_fact_candidates from public,anon,authenticated;
grant select on public.memory_facts,public.memory_fact_candidates to authenticated;
grant update(confidence,importance,valid_from,valid_to) on public.memory_facts to authenticated;
revoke all on public.memory_sources from public,anon,authenticated;
revoke update(source_url,excerpt,note) on public.memory_sources from public,anon,authenticated;
grant select,insert on public.memory_sources to authenticated;
grant update(source_record_id,source_url,excerpt,note) on public.memory_sources to authenticated;
revoke all on function public.write_memory_fact(jsonb,jsonb,uuid),public.promote_memory_fact_candidate(uuid,uuid,uuid[],text) from public,anon,authenticated;
revoke all on function public.validate_memory_candidate(jsonb,jsonb,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.submit_memory_fact_candidate(uuid,jsonb,jsonb,text,text,text,text,text,uuid),public.review_memory_fact_candidate(uuid,text,text,text),public.delete_memory_source(uuid),public.invalidate_memory_fact(uuid,text),public.restore_memory_fact(uuid) from public,anon;
grant execute on function public.submit_memory_fact_candidate(uuid,jsonb,jsonb,text,text,text,text,text,uuid),public.review_memory_fact_candidate(uuid,text,text,text),public.delete_memory_source(uuid),public.invalidate_memory_fact(uuid,text),public.restore_memory_fact(uuid) to authenticated;

commit;
