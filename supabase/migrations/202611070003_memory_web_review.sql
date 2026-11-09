begin;

create or replace function public.review_memory_fact_candidate(p_id uuid,p_action text,p_note text default null,p_client text default 'web')
returns public.memory_fact_candidates language plpgsql security definer set search_path='' as $$
declare v_row public.memory_fact_candidates%rowtype; v_source_ids uuid[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  -- p_client is audit metadata, never proof of human review.
  -- Only normal Supabase Web session JWTs may perform ordinary review.
  if (auth.jwt()->>'aud') is distinct from 'authenticated'
     and (auth.jwt()->'aud') is distinct from '["authenticated"]'::jsonb then
    raise exception 'Ordinary Candidate review requires an authenticated Web session';
  end if;
  if auth.jwt()->>'client_id' is not null then
    raise exception 'OAuth clients cannot perform ordinary Candidate review';
  end if;

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

commit;
