begin;

-- Preserve every merged sample and its original row; the visible measurement keeps one stable ID.
create table if not exists public.healthkit_weight_merged_samples (
  user_id uuid not null references auth.users(id) on delete cascade,
  sample_id uuid not null,
  weight_record_id bigint references public.weight_records(id) on delete set null,
  original_record jsonb not null,
  deleted boolean not null default false,
  merged_at timestamptz not null default now(),
  primary key(user_id,sample_id)
);
create index if not exists idx_healthkit_weight_merge_record on public.healthkit_weight_merged_samples(weight_record_id);
alter table public.healthkit_weight_merged_samples enable row level security;
revoke all on public.healthkit_weight_merged_samples from public,anon,authenticated;
grant select,insert,update,delete on public.healthkit_weight_merged_samples to service_role;

-- Exact instant + stored weight only. Manual entries and merely nearby readings are untouched.
lock table public.weight_records in share row exclusive mode;
create temporary table healthkit_weight_merge_plan on commit drop as
select id,user_id,healthkit_sample_id,
  first_value(id) over(partition by user_id,occurred_at,weight_kg order by created_at,id) as keep_id
from public.weight_records where source='apple_health' and healthkit_sample_id is not null;
insert into public.healthkit_weight_merged_samples(user_id,sample_id,weight_record_id,original_record)
select w.user_id,w.healthkit_sample_id,p.keep_id,to_jsonb(w)
from public.weight_records w join healthkit_weight_merge_plan p on p.id=w.id
where p.id<>p.keep_id
on conflict(user_id,sample_id) do nothing;
delete from public.weight_records w using healthkit_weight_merge_plan p where w.id=p.id and p.id<>p.keep_id;
drop table healthkit_weight_merge_plan;

create or replace function public.ingest_healthkit_body_mass_changes(p_user_id uuid,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  change jsonb; operation text; incoming_sample_id uuid; sync_id text;
  changed integer; accepted integer:=0; canonical_id bigint;
  current_record public.weight_records%rowtype;
  replacement public.healthkit_weight_merged_samples%rowtype;
begin
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>100 then raise exception 'Invalid body mass batch'; end if;
  -- Serialize weight ingestion per account so two simultaneous new UUIDs cannot bypass content merging.
  perform pg_advisory_xact_lock(hashtextextended('healthkit-weight:'||p_user_id::text,0));
  for change in select value from jsonb_array_elements(p_changes) loop
    operation:=change->>'operation';
    if operation not in ('upsert','delete') or (change->>'sampleId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid body mass change'; end if;
    incoming_sample_id:=(change->>'sampleId')::uuid;
    if operation='delete' then
      update public.healthkit_weight_merged_samples m set deleted=true where m.user_id=p_user_id and m.sample_id=incoming_sample_id;
      select * into current_record from public.weight_records w where w.user_id=p_user_id and w.healthkit_sample_id=incoming_sample_id;
      if current_record.id is not null and current_record.source='apple_health' then
        insert into public.healthkit_weight_merged_samples(user_id,sample_id,weight_record_id,original_record,deleted)
        values(p_user_id,incoming_sample_id,current_record.id,to_jsonb(current_record),true)
        on conflict(user_id,sample_id) do update set deleted=true;
        select * into replacement from public.healthkit_weight_merged_samples m
          where m.user_id=p_user_id and m.weight_record_id=current_record.id and not m.deleted
          order by m.merged_at,m.sample_id limit 1;
        if replacement.sample_id is not null then
          -- Deleting one upstream copy must not remove the measurement while another copy survives.
          update public.weight_records set healthkit_sample_id=replacement.sample_id,
            healthkit_source_bundle=replacement.original_record->>'healthkit_source_bundle',
            healthkit_source_name=replacement.original_record->>'healthkit_source_name',
            healthkit_sync_identifier=replacement.original_record->>'healthkit_sync_identifier',
            healthkit_sync_version=coalesce((replacement.original_record->>'healthkit_sync_version')::integer,1)
          where id=current_record.id;
          accepted:=accepted+1;
          continue;
        end if;
      end if;
      update public.weight_records set healthkit_sample_id=null where user_id=p_user_id and healthkit_sample_id=incoming_sample_id and source='manual';
      delete from public.weight_records where user_id=p_user_id and healthkit_sample_id=incoming_sample_id and source='apple_health';
    else
      if (change->>'occurredAt') is null or (change->>'weightKg')::numeric not between 20 and 500 then raise exception 'Invalid body mass sample'; end if;
      -- A merged UUID remains recognized after retry, anchor reset, reinstall, or a user deleting the visible row.
      if exists(select 1 from public.healthkit_weight_merged_samples m where m.user_id=p_user_id and m.sample_id=incoming_sample_id)
        and not exists(select 1 from public.weight_records w where w.user_id=p_user_id and w.healthkit_sample_id=incoming_sample_id) then continue; end if;
      sync_id:=case when (change->>'syncIdentifier')~*'^evaorbit\.weight\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then change->>'syncIdentifier' else null end;
      canonical_id:=null;
      if sync_id is null and not exists(select 1 from public.weight_records w where w.user_id=p_user_id and w.healthkit_sample_id=incoming_sample_id) then
        select id into canonical_id from public.weight_records w
        where w.user_id=p_user_id and w.source='apple_health' and w.healthkit_sample_id is not null
          and w.healthkit_sample_id<>incoming_sample_id and w.occurred_at=(change->>'occurredAt')::timestamptz
          and w.weight_kg=(change->>'weightKg')::numeric(6,2)
        order by w.created_at,w.id limit 1;
      end if;
      if canonical_id is not null then
        insert into public.healthkit_weight_merged_samples(user_id,sample_id,weight_record_id,original_record)
        values(p_user_id,incoming_sample_id,canonical_id,jsonb_build_object(
          'occurred_at',change->>'occurredAt','weight_kg',change->'weightKg','source','apple_health',
          'healthkit_sample_id',incoming_sample_id,'healthkit_source_bundle',change->>'sourceBundle',
          'healthkit_source_name',change->>'sourceName','healthkit_sync_identifier',null,
          'healthkit_sync_version',coalesce((change->>'syncVersion')::integer,1)))
        on conflict(user_id,sample_id) do nothing;
      elsif sync_id is not null and exists(select 1 from public.weight_records where user_id=p_user_id and healthkit_sync_identifier=sync_id) then
        update public.weight_records set occurred_at=(change->>'occurredAt')::timestamptz,occurred_has_explicit_time=true,weight_kg=(change->>'weightKg')::numeric,
          healthkit_sample_id=incoming_sample_id,healthkit_source_bundle=nullif(change->>'sourceBundle',''),healthkit_source_name=nullif(change->>'sourceName',''),
          healthkit_sync_version=greatest(healthkit_sync_version,coalesce((change->>'syncVersion')::integer,1))
        where user_id=p_user_id and healthkit_sync_identifier=sync_id;
      else
        insert into public.weight_records(user_id,occurred_at,occurred_has_explicit_time,weight_kg,source,healthkit_sample_id,healthkit_source_bundle,healthkit_source_name,healthkit_sync_identifier,healthkit_sync_version)
        values(p_user_id,(change->>'occurredAt')::timestamptz,true,(change->>'weightKg')::numeric,'apple_health',incoming_sample_id,nullif(change->>'sourceBundle',''),nullif(change->>'sourceName',''),sync_id,coalesce((change->>'syncVersion')::integer,1))
        on conflict(user_id,healthkit_sample_id) where healthkit_sample_id is not null do update set occurred_at=excluded.occurred_at,weight_kg=excluded.weight_kg,healthkit_source_bundle=excluded.healthkit_source_bundle,healthkit_source_name=excluded.healthkit_source_name;
      end if;
    end if;
    get diagnostics changed=row_count;
    accepted:=accepted+changed;
  end loop;
  return jsonb_build_object('accepted',accepted,'received',jsonb_array_length(p_changes));
end; $$;
revoke all on function public.ingest_healthkit_body_mass_changes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_healthkit_body_mass_changes(uuid,jsonb) to service_role;

commit;
