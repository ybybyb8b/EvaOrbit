begin;

alter table public.memory_facts
  add column if not exists epistemic_type text not null default 'unknown'
    check (epistemic_type in ('direct_statement','recorded_observation','derived','agent_judgment','external_report','unknown')),
  add column if not exists supersedes_fact_id uuid;

alter table public.memory_facts
  add constraint memory_facts_supersedes_owner_fk
  foreign key (supersedes_fact_id,user_id) references public.memory_facts(id,user_id) on delete restrict;

create unique index if not exists idx_memory_facts_supersedes
  on public.memory_facts(user_id,supersedes_fact_id) where supersedes_fact_id is not null;

create table if not exists public.memory_fact_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proposed_fact jsonb not null check (jsonb_typeof(proposed_fact)='object'),
  proposed_sources jsonb not null check (jsonb_typeof(proposed_sources)='array' and jsonb_array_length(proposed_sources)>0),
  proposed_by text not null check (proposed_by in ('user','model','system','import')),
  proposer_model text,
  status text not null default 'pending' check (status in ('pending','promoted','rejected')),
  review_note text check (review_note is null or char_length(review_note)<=2000),
  promoted_fact_id uuid,
  created_at timestamptz not null default timezone('utc',now()),
  reviewed_at timestamptz,
  unique(id,user_id),
  foreign key(promoted_fact_id,user_id) references public.memory_facts(id,user_id) on delete restrict,
  check ((status='pending' and reviewed_at is null and promoted_fact_id is null) or (status='promoted' and reviewed_at is not null and promoted_fact_id is not null) or (status='rejected' and reviewed_at is not null and promoted_fact_id is null))
);

create index if not exists idx_memory_fact_candidates_status on public.memory_fact_candidates(user_id,status,created_at desc,id);
alter table public.memory_fact_candidates enable row level security;
create policy memory_fact_candidates_owner_all on public.memory_fact_candidates for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert on public.memory_fact_candidates to authenticated;
grant update(status,review_note,promoted_fact_id,reviewed_at) on public.memory_fact_candidates to authenticated;

create or replace function public.write_memory_fact(p_fact jsonb,p_sources jsonb,p_superseded_fact_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_fact_id uuid := (p_fact->>'id')::uuid; v_source jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)=0 then raise exception 'at least one source is required'; end if;
  if p_superseded_fact_id is not null then
    perform 1 from public.memory_facts where id=p_superseded_fact_id and user_id=v_user and status='active' for update;
    if not found then raise exception 'superseded fact is missing or inactive'; end if;
  end if;
  insert into public.memory_facts(id,user_id,subject_entity_id,predicate,object_entity_id,object_value,perspective_entity_id,epistemic_type,supersedes_fact_id,confidence,importance,valid_from,valid_to,status)
  values(v_fact_id,v_user,(p_fact->>'subjectEntityId')::uuid,p_fact->>'predicate',nullif(p_fact->>'objectEntityId','')::uuid,case when p_fact->'objectValue'='null'::jsonb then null else p_fact->'objectValue' end,nullif(p_fact->>'perspectiveEntityId','')::uuid,coalesce(p_fact->>'epistemicType','unknown'),p_superseded_fact_id,coalesce((p_fact->>'confidence')::numeric,1),coalesce((p_fact->>'importance')::smallint,3),nullif(p_fact->>'validFrom','')::date,nullif(p_fact->>'validTo','')::date,'active');
  for v_source in select value from jsonb_array_elements(p_sources) loop
    insert into public.memory_sources(id,user_id,fact_id,source_resource,source_record_id,source_url,excerpt,note)
    values((v_source->>'id')::uuid,v_user,v_fact_id,v_source->>'sourceResource',nullif(v_source->>'sourceRecordId',''),nullif(v_source->>'sourceUrl',''),nullif(v_source->>'excerpt',''),nullif(v_source->>'note',''));
  end loop;
  if p_superseded_fact_id is not null then
    update public.memory_facts set status='invalidated',invalidated_at=timezone('utc',now()),invalidation_reason='superseded'
    where id=p_superseded_fact_id and user_id=v_user;
  end if;
  return v_fact_id;
end $$;

create or replace function public.restore_memory_fact(p_fact_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists(select 1 from public.memory_facts where user_id=(select auth.uid()) and supersedes_fact_id=p_fact_id and status='active') then raise exception 'fact has an active replacement'; end if;
  update public.memory_facts set status='active',invalidated_at=null,invalidation_reason=null where id=p_fact_id and user_id=(select auth.uid()) and status='invalidated';
  return found;
end $$;

create or replace function public.promote_memory_fact_candidate(p_candidate_id uuid,p_fact_id uuid,p_source_ids uuid[],p_review_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_candidate public.memory_fact_candidates%rowtype; v_sources jsonb; v_index integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_candidate from public.memory_fact_candidates where id=p_candidate_id and user_id=(select auth.uid()) and status='pending' for update;
  if v_candidate.id is null then return null; end if;
  if coalesce(array_length(p_source_ids,1),0)<>jsonb_array_length(v_candidate.proposed_sources) then raise exception 'candidate source identifiers are incomplete'; end if;
  select jsonb_agg(value||jsonb_build_object('id',p_source_ids[ordinality])) into v_sources from jsonb_array_elements(v_candidate.proposed_sources) with ordinality;
  perform public.write_memory_fact(v_candidate.proposed_fact||jsonb_build_object('id',p_fact_id),v_sources,nullif(v_candidate.proposed_fact->>'supersedesFactId','')::uuid);
  update public.memory_fact_candidates set status='promoted',review_note=p_review_note,promoted_fact_id=p_fact_id,reviewed_at=timezone('utc',now()) where id=p_candidate_id and user_id=(select auth.uid());
  return p_fact_id;
end $$;

revoke all on function public.write_memory_fact(jsonb,jsonb,uuid),public.restore_memory_fact(uuid),public.promote_memory_fact_candidate(uuid,uuid,uuid[],text) from public;
grant execute on function public.write_memory_fact(jsonb,jsonb,uuid),public.restore_memory_fact(uuid),public.promote_memory_fact_candidate(uuid,uuid,uuid[],text) to authenticated;

commit;
