create or replace function public.guard_memory_source_evidence()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    perform public.validate_memory_source(jsonb_build_object(
      'sourceResource', new.source_resource, 'sourceRecordId', new.source_record_id,
      'sourceUrl', new.source_url, 'excerpt', new.excerpt, 'note', new.note
    ));
    return new;
  end if;

  if row(new.source_resource, new.source_record_id, new.source_url, new.excerpt)
     is not distinct from row(old.source_resource, old.source_record_id, old.source_url, old.excerpt) then
    return new;
  end if;

  -- Validate only changed evidence fields before checking the resulting evidence.
  if (new.source_resource is distinct from old.source_resource
      and (new.source_resource !~ '[^[:space:]]' or char_length(new.source_resource) > 100))
     or (new.source_record_id is distinct from old.source_record_id and new.source_record_id !~ '[^[:space:]]')
     or (new.excerpt is distinct from old.excerpt and new.excerpt !~ '[^[:space:]]') then
    raise exception 'Source field is blank or too long';
  end if;
  if new.source_url is distinct from old.source_url and new.source_url !~* '^https?://[^[:space:]/?#]+[^[:space:]]*$' then
    raise exception 'Source URL must be HTTP or HTTPS';
  end if;
  if not public.memory_source_has_evidence(new.source_resource, new.source_record_id, new.source_url, new.excerpt) then
    raise exception 'Source requires evidence; chat requires an original excerpt; external requires a URL or record ID';
  end if;
  return new;
end $$;
