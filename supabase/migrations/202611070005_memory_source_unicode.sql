-- ECMAScript WhiteSpace and LineTerminator, used by JavaScript trim() and \s.
create function public.memory_source_whitespace()
returns text language sql immutable set search_path='' as $$
  select U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
$$;

create function public.memory_source_is_http_url(p_url text)
returns boolean language sql immutable strict set search_path='' as $$
  select translate(p_url, public.memory_source_whitespace(), '') collate "C" = p_url
     and p_url collate "C" ~* '^https?://[^/?#]+'
$$;

create or replace function public.memory_source_has_evidence(p_resource text,p_record text,p_url text,p_excerpt text)
returns boolean language sql immutable set search_path='' as $$
  select case lower(btrim(p_resource, public.memory_source_whitespace()) collate "C")
    when 'chat' then coalesce(btrim(p_excerpt, public.memory_source_whitespace()) <> '', false)
    else coalesce(btrim(p_record, public.memory_source_whitespace()) <> '', false)
      or coalesce(public.memory_source_is_http_url(p_url), false)
  end
$$;

create or replace function public.validate_memory_source(p_source jsonb)
returns void language plpgsql set search_path='' as $$
declare
  v_key text;
  v_text text;
  v_whitespace constant text := public.memory_source_whitespace();
begin
  if jsonb_typeof(p_source) is distinct from 'object' then raise exception 'Source must be an object'; end if;
  foreach v_key in array array['sourceResource','sourceRecordId','sourceUrl','excerpt','note'] loop
    if p_source?v_key and p_source->v_key<>'null'::jsonb and jsonb_typeof(p_source->v_key)<>'string' then raise exception 'Source fields must be strings'; end if;
    v_text := p_source->>v_key;
    if v_text is not null and (btrim(v_text, v_whitespace) = '' or char_length(v_text) > case v_key when 'sourceResource' then 100 when 'sourceRecordId' then 300 when 'sourceUrl' then 2000 when 'excerpt' then 10000 else 2000 end) then
      raise exception 'Source field is blank or too long';
    end if;
  end loop;
  if p_source->>'sourceResource' is null then raise exception 'sourceResource required'; end if;
  if not public.memory_source_is_http_url(p_source->>'sourceUrl') then raise exception 'Source URL must be HTTP or HTTPS'; end if;
  if not public.memory_source_has_evidence(p_source->>'sourceResource',p_source->>'sourceRecordId',p_source->>'sourceUrl',p_source->>'excerpt') then raise exception 'Source requires evidence; chat requires an original excerpt; external requires a URL or record ID'; end if;
end $$;

create or replace function public.guard_memory_source_evidence()
returns trigger language plpgsql set search_path='' as $$
declare v_whitespace constant text := public.memory_source_whitespace();
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

  if (new.source_resource is distinct from old.source_resource
      and (btrim(new.source_resource, v_whitespace) = '' or char_length(new.source_resource) > 100))
     or (new.source_record_id is distinct from old.source_record_id and btrim(new.source_record_id, v_whitespace) = '')
     or (new.excerpt is distinct from old.excerpt and btrim(new.excerpt, v_whitespace) = '') then
    raise exception 'Source field is blank or too long';
  end if;
  if new.source_url is distinct from old.source_url and not public.memory_source_is_http_url(new.source_url) then
    raise exception 'Source URL must be HTTP or HTTPS';
  end if;
  if not public.memory_source_has_evidence(new.source_resource, new.source_record_id, new.source_url, new.excerpt) then
    raise exception 'Source requires evidence; chat requires an original excerpt; external requires a URL or record ID';
  end if;
  return new;
end $$;
