-- Extend the C1 read RPC for context retrieval without changing its signature or tables.
create or replace function public.read_memory_page(
  p_resource text, p_filters jsonb, p_order text, p_after jsonb, p_limit integer
)
returns setof jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  v_table text;
  v_where text;
  v_projection text := 'to_jsonb(r)';
  v_time text;
  v_id_type text;
  v_id_direction text;
  v_boundary text := 'true';
  v_importance boolean := p_order = 'display' and p_resource = 'fact';
begin
  if p_order is null or p_order not in ('display','created') or p_limit is null or p_limit not between 1 and 201 then
    raise exception 'Invalid Memory page options';
  end if;

  case p_resource
    when 'memo' then
      v_table := 'memos';
      v_where := $filter$
        ($1->>'status' is null or r.status=$1->>'status')
        and ($1->>'type' is null or r.type=$1->>'type')
        and ($1->>'tag' is null or ($1->>'tag')=any(r.tags))
        and (not ($1?'relatedTerms') and coalesce(btrim($1->>'query'),'')='' or exists (
          select 1 from jsonb_array_elements_text(coalesce($1->'relatedTerms',jsonb_build_array(btrim($1->>'query')))) q(term)
          where strpos(lower(r.title),lower(q.term))>0 or strpos(lower(r.content),lower(q.term))>0
            or (($1?'relatedTerms') and (
              strpos(r.type,lower(q.term))>0 or strpos(r.status,lower(q.term))>0 or
              exists (select 1 from unnest(r.tags) tag where strpos(lower(tag),lower(q.term))>0)))
        ))
      $filter$;
    when 'entity' then
      v_table := 'memory_entities';
      v_where := $filter$
        ($1->>'entityType' is null or r.entity_type=$1->>'entityType')
        and case when $1->>'status' is not null then r.status=$1->>'status'
          else coalesce(($1->>'includeMerged')::boolean,false) or r.status<>'merged' end
        and (not ($1?'ids') or r.id in (select value::uuid from jsonb_array_elements_text($1->'ids')))
        and (not ($1?'relatedTerms') and coalesce(btrim($1->>'query'),'')='' or exists (
          select 1 from jsonb_array_elements_text(coalesce($1->'relatedTerms',jsonb_build_array(btrim($1->>'query')))) q(term)
          where strpos(lower(r.canonical_name),lower(q.term))>0
            or exists (select 1 from unnest(r.aliases) a where strpos(lower(a),lower(q.term))>0)
        ))
      $filter$;
    when 'fact' then
      v_table := 'memory_facts';
      v_where := $filter$
        ($1->>'status' is null or r.status=$1->>'status')
        and ($1->>'predicate' is null or r.predicate=$1->>'predicate')
        and (not ($1?'ids') or r.id in (select value::uuid from jsonb_array_elements_text($1->'ids')))
        and (not ($1?'supersedesIds') or r.supersedes_fact_id in (select value::uuid from jsonb_array_elements_text($1->'supersedesIds')))
        and (not ($1?'relatedEntityIds') or exists (
          select 1 from jsonb_array_elements_text($1->'relatedEntityIds') e(id)
          where e.id::uuid in (r.subject_entity_id,r.object_entity_id,r.perspective_entity_id)))
        and ($1->>'entityId' is null or
          (coalesce($1->>'direction','both')<>'in' and r.subject_entity_id=($1->>'entityId')::uuid) or
          (coalesce($1->>'direction','both')<>'out' and r.object_entity_id=($1->>'entityId')::uuid))
        and (not ($1?'perspectiveEntityId') or r.perspective_entity_id is not distinct from ($1->>'perspectiveEntityId')::uuid)
        and ($1->>'validOn' is null or
          ((r.valid_from is null or r.valid_from<=($1->>'validOn')::date)
            and (r.valid_to is null or r.valid_to>=($1->>'validOn')::date)))
        and (not ($1?'relatedTerms') and coalesce(btrim($1->>'query'),'')='' or exists (
          select 1 from jsonb_array_elements_text(
            coalesce($1->'relatedTerms', jsonb_build_array(btrim($1->>'query')))
          ) as q(term)
          cross join lateral (select lower(q.term collate "C") as value) n
          where strpos(lower(r.predicate collate "C"),n.value)>0
          or exists (
            select 1 from jsonb_path_query(r.object_value,'strict $.**') j(value)
            left join lateral jsonb_object_keys(case when jsonb_typeof(j.value)='object' then j.value else '{}'::jsonb end) k(key) on true
            where strpos(lower(k.key collate "C"),n.value)>0
              or (jsonb_typeof(j.value) in ('string','boolean','null') and
                strpos(lower(coalesce(j.value #>> '{}','null') collate "C"),n.value)>0)
              or (jsonb_typeof(j.value)='number' and case
                when length(q.term)<=500 and q.term ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?([eE][+-]?[0-9]{1,3})?$'
                then (j.value #>> '{}')::numeric=q.term::numeric else false end)
          )
          or exists (
            select 1 from public.memory_entities e where e.user_id=r.user_id
              and (e.id=r.object_entity_id or (($1?'relatedTerms') and e.id in (r.subject_entity_id,r.perspective_entity_id)))
              and (strpos(lower(e.canonical_name collate "C"),n.value)>0 or
                exists (select 1 from unnest(e.aliases) a where strpos(lower(a collate "C"),n.value)>0))
          )
          or (($1?'relatedTerms') and exists (
            select 1 from public.memory_sources s where s.user_id=r.user_id and s.fact_id=r.id
              and (strpos(lower(s.excerpt collate "C"),n.value)>0 or strpos(lower(s.note collate "C"),n.value)>0
                or strpos(lower(s.source_resource collate "C"),n.value)>0 or strpos(lower(s.source_record_id collate "C"),n.value)>0)
          ))
        ))
      $filter$;
      if coalesce((p_filters->>'includeSourceMatches')::boolean,false) then
        v_projection := $projection$
          to_jsonb(r) || jsonb_build_object('source_matches', coalesce((
            select jsonb_agg(distinct jsonb_build_object('term',q.term,'field',m.field))
            from public.memory_sources s
            cross join jsonb_array_elements_text($1->'relatedTerms') q(term)
            cross join lateral (values ('source_excerpt',s.excerpt),('source_note',s.note),
              ('source_resource',s.source_resource),('source_record_id',s.source_record_id)) m(field,value)
            where s.user_id=r.user_id and s.fact_id=r.id and strpos(lower(m.value collate "C"),lower(q.term collate "C"))>0
          ),'[]'::jsonb))
        $projection$;
      end if;
    when 'source' then
      v_table := 'memory_sources';
      v_where := $filter$
        ($1->>'factId' is null or r.fact_id=($1->>'factId')::uuid)
        and ($1->>'sourceResource' is null or r.source_resource=$1->>'sourceResource')
        and ($1->>'sourceRecordId' is null or r.source_record_id=$1->>'sourceRecordId')
        and (not ($1?'factIds') or r.fact_id in (select value::uuid from jsonb_array_elements_text($1->'factIds')))
        and (coalesce(btrim($1->>'query'),'')='' or
          strpos(lower(r.excerpt collate "C"),lower(btrim($1->>'query') collate "C"))>0 or
          strpos(lower(r.note collate "C"),lower(btrim($1->>'query') collate "C"))>0 or
          strpos(lower(r.source_resource collate "C"),lower(btrim($1->>'query') collate "C"))>0)
      $filter$;
    when 'candidate' then
      v_table := 'memory_fact_candidates';
      v_where := $filter$
        ($1->>'status' is null or r.status=$1->>'status')
        and ($1->>'proposedBy' is null or r.proposed_by=$1->>'proposedBy')
        and ($1->>'promotedFactId' is null or r.promoted_fact_id=($1->>'promotedFactId')::uuid)
      $filter$;
    else raise exception 'Unknown Memory resource';
  end case;

  v_time := case when p_order='display' and p_resource in ('memo','entity','fact') then 'updated_at' else 'created_at' end;
  v_id_type := case when p_resource='memo' then 'bigint' else 'uuid' end;
  v_id_direction := case when p_resource='memo' then 'desc' else 'asc' end;
  if p_after is not null then
    v_boundary := format('(r.%1$I<($2->>''time'')::timestamptz or (r.%1$I=($2->>''time'')::timestamptz and r.id %2$s ($2->>''id'')::%3$s))',
      v_time, case when p_resource='memo' then '<' else '>' end, v_id_type);
    if v_importance then
      v_boundary := format('(r.importance<($2->>''importance'')::integer or (r.importance=($2->>''importance'')::integer and %s))', v_boundary);
    end if;
  end if;

  -- All interpolated SQL fragments are selected above. Request values use bound parameters.
  return query execute format(
    'select %s from public.%I r where r.user_id=(select auth.uid()) and (%s) and (%s) order by %sr.%I desc, r.id %s limit $3',
    v_projection, v_table, v_where, v_boundary, case when v_importance then 'r.importance desc, ' else '' end, v_time, v_id_direction
  ) using p_filters, p_after, p_limit;
end $$;

revoke all on function public.read_memory_page(text,jsonb,text,jsonb,integer) from public,anon;
grant execute on function public.read_memory_page(text,jsonb,text,jsonb,integer) to authenticated;
