begin;

create table if not exists public.insight_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('daily','monthly','quarterly','yearly')),
  period_start date not null,
  period_end date not null check (period_end > period_start),
  time_zone text not null default 'Asia/Shanghai' check (time_zone='Asia/Shanghai'),
  current_version integer not null default 0 check (current_version >= 0),
  status text not null check (status in ('ready','no_findings')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,period_type,period_start), unique(user_id,id)
);
create table if not exists public.insight_report_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  report_id uuid not null,
  version integer not null check (version > 0),
  request_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=524288),
  created_at timestamptz not null default now(),
  foreign key(user_id,report_id) references public.insight_reports(user_id,id),
  unique(user_id,request_key), unique(report_id,version)
);
alter table public.insight_reports enable row level security;
alter table public.insight_report_versions enable row level security;
drop policy if exists insight_reports_owner on public.insight_reports;
create policy insight_reports_owner on public.insight_reports for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists insight_report_versions_owner on public.insight_report_versions;
create policy insight_report_versions_owner on public.insight_report_versions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.insight_reports,public.insight_report_versions from public,anon,authenticated;
grant select on public.insight_reports,public.insight_report_versions to authenticated;

create or replace function public.reject_insight_version_update() returns trigger
language plpgsql set search_path=public as $$begin raise exception 'Insight versions are immutable';end$$;
drop trigger if exists insight_versions_immutable on public.insight_report_versions;
create trigger insight_versions_immutable before update on public.insight_report_versions for each row execute function public.reject_insight_version_update();

-- The only authenticated write path. No caller can bypass version checks through table CRUD.
create or replace function public.save_insight_report(p_date date,p_period_end date,p_expected_version integer,p_request_key uuid,p_request_hash text,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid := auth.uid(); r public.insight_reports; v public.insight_report_versions; f jsonb; e jsonb; ref jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_date is null or p_date >= (now() at time zone 'Asia/Shanghai')::date or p_period_end is distinct from p_date+1
    or p_expected_version is null or p_expected_version<0 or p_request_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid Daily report command'; end if;
  -- Serialize by account: a request UUID cannot race across two different periods.
  perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
  select * into v from public.insight_report_versions where user_id=owner_id and request_key=p_request_key;
  if v.id is not null then
    if v.request_hash<>p_request_hash then raise exception 'INSIGHT_REQUEST_CONFLICT';end if;
    select * into r from public.insight_reports where id=v.report_id and user_id=owner_id;
    if r.period_start<>p_date then raise exception 'INSIGHT_REQUEST_CONFLICT';end if;
    return jsonb_build_object('report',to_jsonb(r),'version',to_jsonb(v));
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'findings') is distinct from 'array' or jsonb_array_length(p_snapshot->'findings')>40
    or jsonb_typeof(p_snapshot->'evidence') is distinct from 'array' or jsonb_array_length(p_snapshot->'evidence')>200
    or jsonb_typeof(p_snapshot->'summary') is distinct from 'string' or length(btrim(p_snapshot->>'summary')) not between 1 and 5000
    or coalesce(p_snapshot->>'method','') not in ('rule','ai')
    or jsonb_typeof(p_snapshot->'agent') is distinct from 'string' or length(btrim(p_snapshot->>'agent')) not between 1 and 200
    or jsonb_typeof(p_snapshot->'revisionNote') is distinct from 'string' or length(p_snapshot->>'revisionNote')>2000
    or jsonb_typeof(p_snapshot->'input') is distinct from 'object' or coalesce(p_snapshot#>>'{input,fingerprint}','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_snapshot#>'{input,coverage}') is distinct from 'object' or jsonb_typeof(p_snapshot#>'{input,metrics}') is distinct from 'object'
    or jsonb_typeof(p_snapshot#>'{input,limitations}') is distinct from 'array' or jsonb_typeof(p_snapshot#>'{input,capturedAt}') is distinct from 'string'
    then raise exception 'Invalid report snapshot';end if;
  perform (p_snapshot#>>'{input,capturedAt}')::timestamptz;
  if jsonb_array_length(p_snapshot#>'{input,limitations}')>40 or exists(select 1 from jsonb_array_elements(p_snapshot#>'{input,limitations}') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>2000) then raise exception 'Invalid input limitations';end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'evidence') t group by t->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_snapshot->'findings') t group by t->>'id' having count(*)>1) then raise exception 'Duplicate snapshot IDs';end if;
  for e in select value from jsonb_array_elements(p_snapshot->'evidence') loop
    if jsonb_typeof(e)<>'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(btrim(e->>'id')) not between 1 and 100
      or jsonb_typeof(e->'label') is distinct from 'string' or length(btrim(e->>'label')) not between 1 and 500
      or jsonb_typeof(e->'metrics') is distinct from 'object'
      or exists(select 1 from unnest(array['resource','recordId','resourceId','href','from','to']) k where coalesce(jsonb_typeof(e->k),'null') not in ('string','null'))
      or (e->'href'<>'null'::jsonb and (jsonb_typeof(e->'href') is distinct from 'string' or (e->>'href') !~ '^/(food|drinks|trackers|health|tasks|insights)([/?#]|$)' or position(chr(92) in e->>'href')>0))
      then raise exception 'Invalid evidence';end if;
    if e->>'from' is not null then perform (e->>'from')::timestamptz;end if;
    if e->>'to' is not null then perform (e->>'to')::timestamptz;end if;
    if e->>'from' is not null and e->>'to' is not null and (e->>'from')::timestamptz >= (e->>'to')::timestamptz then raise exception 'Invalid evidence range';end if;
  end loop;
  for f in select value from jsonb_array_elements(p_snapshot->'findings') loop
    if jsonb_typeof(f)<>'object' or jsonb_typeof(f->'id') is distinct from 'string' or length(btrim(f->>'id')) not between 1 and 100
      or jsonb_typeof(f->'title') is distinct from 'string' or length(btrim(f->>'title')) not between 1 and 300
      or jsonb_typeof(f->'body') is distinct from 'string' or length(btrim(f->>'body')) not between 1 and 5000
      or coalesce(f->>'domain','') not in ('food','drink','tracker','training','health','tasks','cross_domain')
      or coalesce(f->>'importance','') not in ('low','normal','high') or coalesce(f->>'kind','') not in ('fact','interpretation','hypothesis')
      or coalesce(f->>'method','') not in ('rule','ai') or (p_snapshot->>'method'='rule' and f->>'method'<>'rule')
      or jsonb_typeof(f->'evidenceIds') is distinct from 'array' or jsonb_array_length(f->'evidenceIds') not between 1 and 200
      or jsonb_typeof(f->'revises') is distinct from 'array' or jsonb_array_length(f->'revises')>10 then raise exception 'Invalid finding';end if;
    for e in select value from jsonb_array_elements(f->'evidenceIds') loop
      if jsonb_typeof(e)<>'string' or not exists(select 1 from jsonb_array_elements(p_snapshot->'evidence') t where t->>'id'=e#>>'{}') then raise exception 'Missing evidence';end if;
    end loop;
    for ref in select value from jsonb_array_elements(f->'revises') loop
      if not exists(select 1 from public.insight_report_versions old cross join lateral jsonb_array_elements(old.snapshot->'findings') old_f
        where old.user_id=owner_id and old.report_id=(ref->>'reportId')::uuid and old.version=(ref->>'version')::integer and old_f->>'id'=ref->>'findingId') then raise exception 'Invalid revision reference';end if;
    end loop;
  end loop;
  select * into r from public.insight_reports where user_id=owner_id and period_type='daily' and period_start=p_date for update;
  if coalesce(r.current_version,0)<>p_expected_version then raise exception 'INSIGHT_VERSION_CONFLICT';end if;
  if r.id is null then
    insert into public.insight_reports(user_id,period_type,period_start,period_end,status) values(owner_id,'daily',p_date,p_period_end,'ready') returning * into r;
  end if;
  insert into public.insight_report_versions(user_id,report_id,version,request_key,request_hash,snapshot)
    values(owner_id,r.id,r.current_version+1,p_request_key,p_request_hash,p_snapshot) returning * into v;
  update public.insight_reports set current_version=v.version,status=case when jsonb_array_length(p_snapshot->'findings')=0 then 'no_findings' else 'ready' end,updated_at=now()
    where id=r.id and user_id=owner_id returning * into r;
  return jsonb_build_object('report',to_jsonb(r),'version',to_jsonb(v));
end$$;
revoke all on function public.save_insight_report(date,date,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.save_insight_report(date,date,integer,uuid,text,jsonb) to authenticated;
commit;
