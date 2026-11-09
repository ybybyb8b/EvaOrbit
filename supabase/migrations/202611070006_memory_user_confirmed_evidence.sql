create or replace function public.validate_memory_candidate(p_fact jsonb,p_sources jsonb,p_mode text,p_by text,p_writer text,p_request uuid)
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
      or not exists (
        select 1 from jsonb_array_elements(p_sources) s
        -- With record ID and URL omitted, only a chat excerpt can supply evidence.
        where public.memory_source_has_evidence(s->>'sourceResource', null, null, s->>'excerpt')
      )) then
    raise exception 'user_confirmed requires direct_statement, original user excerpt, written_by and request_id';
  end if;
end $$;
