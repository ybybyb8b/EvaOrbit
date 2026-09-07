begin;

create table if not exists public.memory_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  canonical_name text not null check (char_length(btrim(canonical_name)) between 1 and 200),
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 80),
  aliases text[] not null default '{}',
  description text check (description is null or char_length(description) <= 5000),
  status text not null default 'active' check (status in ('active','archived','merged')),
  merged_into_entity_id uuid,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(id,user_id),
  foreign key(merged_into_entity_id,user_id) references public.memory_entities(id,user_id) on delete restrict,
  check (cardinality(aliases) <= 50),
  check (merged_into_entity_id is null or merged_into_entity_id <> id),
  check ((status='merged') = (merged_into_entity_id is not null))
);

create table if not exists public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_entity_id uuid not null,
  predicate text not null check (char_length(btrim(predicate)) between 1 and 120),
  object_entity_id uuid,
  object_value jsonb,
  perspective_entity_id uuid,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  importance smallint not null default 3 check (importance between 1 and 5),
  valid_from date,
  valid_to date,
  status text not null default 'active' check (status in ('active','invalidated')),
  invalidated_at timestamptz,
  invalidation_reason text check (invalidation_reason is null or char_length(invalidation_reason) <= 2000),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(id,user_id),
  foreign key(subject_entity_id,user_id) references public.memory_entities(id,user_id) on delete restrict,
  foreign key(object_entity_id,user_id) references public.memory_entities(id,user_id) on delete restrict,
  foreign key(perspective_entity_id,user_id) references public.memory_entities(id,user_id) on delete restrict,
  check ((object_entity_id is null) <> (object_value is null)),
  check (object_value is null or object_value <> 'null'::jsonb),
  check (valid_from is null or valid_to is null or valid_to >= valid_from),
  check ((status='active' and invalidated_at is null and invalidation_reason is null) or (status='invalidated' and invalidated_at is not null))
);

create table if not exists public.memory_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fact_id uuid not null,
  source_resource text not null check (char_length(btrim(source_resource)) between 1 and 100),
  source_record_id text check (source_record_id is null or char_length(source_record_id) between 1 and 300),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  excerpt text check (excerpt is null or char_length(excerpt) <= 10000),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(id,user_id),
  foreign key(fact_id,user_id) references public.memory_facts(id,user_id) on delete cascade,
  check (source_record_id is not null or source_url is not null or excerpt is not null or note is not null)
);

create index if not exists idx_memory_entities_list on public.memory_entities(user_id,status,entity_type,updated_at desc);
create index if not exists idx_memory_entities_name on public.memory_entities(user_id,lower(canonical_name));
create index if not exists idx_memory_entities_aliases on public.memory_entities using gin(aliases);
create index if not exists idx_memory_facts_subject on public.memory_facts(user_id,subject_entity_id,status,updated_at desc);
create index if not exists idx_memory_facts_object on public.memory_facts(user_id,object_entity_id,status,updated_at desc) where object_entity_id is not null;
create index if not exists idx_memory_facts_perspective on public.memory_facts(user_id,perspective_entity_id,status,updated_at desc) where perspective_entity_id is not null;
create index if not exists idx_memory_sources_fact on public.memory_sources(user_id,fact_id,created_at,id);
create index if not exists idx_memory_sources_origin on public.memory_sources(user_id,source_resource,source_record_id);
create unique index if not exists idx_memory_sources_unique_record on public.memory_sources(user_id,fact_id,source_resource,source_record_id) where source_record_id is not null;

create trigger memory_entities_set_updated_at before update on public.memory_entities for each row execute function public.set_updated_at();
create trigger memory_facts_set_updated_at before update on public.memory_facts for each row execute function public.set_updated_at();
create trigger memory_sources_set_updated_at before update on public.memory_sources for each row execute function public.set_updated_at();

alter table public.memory_entities enable row level security;
alter table public.memory_facts enable row level security;
alter table public.memory_sources enable row level security;

create policy memory_entities_owner_all on public.memory_entities for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy memory_facts_owner_all on public.memory_facts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy memory_sources_owner_all on public.memory_sources for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create or replace function public.search_memory_entities(p_query text,p_entity_type text default null,p_status text default null,p_include_merged boolean default false,p_limit integer default 100)
returns setof public.memory_entities language sql stable security invoker set search_path='' as $$
  select entity.* from public.memory_entities entity
  where entity.user_id=(select auth.uid())
    and (p_entity_type is null or entity.entity_type=p_entity_type)
    and ((p_status is not null and entity.status=p_status) or (p_status is null and (p_include_merged or entity.status<>'merged')))
    and (strpos(lower(entity.canonical_name),lower(btrim(p_query)))>0 or exists(select 1 from unnest(entity.aliases) as names(alias) where strpos(lower(alias),lower(btrim(p_query)))>0))
  order by entity.updated_at desc,entity.id
  limit least(greatest(coalesce(p_limit,100),1),200)
$$;

create or replace function public.merge_memory_entities(p_source_id uuid,p_target_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_source public.memory_entities%rowtype; v_target public.memory_entities%rowtype; v_aliases text[]; v_redirected integer; v_self_loops integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_source_id=p_target_id then raise exception 'source and target entities must differ'; end if;
  perform 1 from public.memory_entities where id in (p_source_id,p_target_id) and user_id=(select auth.uid()) order by id for update;
  select * into v_source from public.memory_entities where id=p_source_id and user_id=(select auth.uid());
  select * into v_target from public.memory_entities where id=p_target_id and user_id=(select auth.uid());
  if v_source.id is null or v_target.id is null then return null; end if;
  if v_source.status<>'active' or v_target.status<>'active' then raise exception 'both entities must be active'; end if;
  select coalesce(array_agg(alias order by lower(alias)),'{}'::text[]) into v_aliases from (select distinct on(lower(btrim(value))) btrim(value) alias from unnest(v_target.aliases||v_source.aliases||array[v_source.canonical_name]) as source_aliases(value) where btrim(value)<>'' and lower(btrim(value))<>lower(v_target.canonical_name) order by lower(btrim(value)),btrim(value)) names;
  if cardinality(v_aliases)>50 then raise exception 'merged aliases would exceed the 50-alias limit'; end if;
  select count(*) into v_redirected from public.memory_facts where user_id=(select auth.uid()) and (subject_entity_id=p_source_id or object_entity_id=p_source_id or perspective_entity_id=p_source_id);
  update public.memory_entities set aliases=v_aliases where id=p_target_id and user_id=(select auth.uid());
  update public.memory_facts set subject_entity_id=p_target_id where subject_entity_id=p_source_id and user_id=(select auth.uid());
  update public.memory_facts set object_entity_id=p_target_id where object_entity_id=p_source_id and user_id=(select auth.uid());
  update public.memory_facts set perspective_entity_id=p_target_id where perspective_entity_id=p_source_id and user_id=(select auth.uid());
  update public.memory_entities set status='merged',merged_into_entity_id=p_target_id where id=p_source_id and user_id=(select auth.uid());
  select count(*) into v_self_loops from public.memory_facts where user_id=(select auth.uid()) and subject_entity_id=p_target_id and object_entity_id=p_target_id;
  return jsonb_build_object('target_id',p_target_id,'redirected_facts',v_redirected,'self_loops',v_self_loops);
end $$;

grant select,insert on public.memory_entities,public.memory_facts,public.memory_sources to authenticated;
grant update(canonical_name,entity_type,aliases,description,status) on public.memory_entities to authenticated;
grant update(confidence,importance,valid_from,valid_to,status,invalidated_at,invalidation_reason) on public.memory_facts to authenticated;
grant update(source_url,excerpt,note) on public.memory_sources to authenticated;
grant delete on public.memory_sources to authenticated;
revoke all on function public.merge_memory_entities(uuid,uuid) from public;
grant execute on function public.merge_memory_entities(uuid,uuid) to authenticated;
revoke all on function public.search_memory_entities(text,text,text,boolean,integer) from public;
grant execute on function public.search_memory_entities(text,text,text,boolean,integer) to authenticated;

commit;
