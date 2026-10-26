begin;
create table if not exists public.insight_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, status text not null check(status in ('running','succeeded','waiting_data','waiting_retry','failed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 3), current_attempt_id uuid not null,
  lease_until timestamptz, next_retry_at timestamptz, report_id uuid, report_version integer, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,date), unique(user_id,id), foreign key(report_id,report_version) references public.insight_report_versions(report_id,version)
);
create table if not exists public.insight_run_attempts (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, run_id uuid not null,
  attempt_number integer not null check(attempt_number between 1 and 3), request_key uuid not null,
  status text not null check(status in ('running','succeeded','failed','expired','waiting_data')),
  base_snapshot jsonb not null check(jsonb_typeof(base_snapshot)='object' and octet_length(base_snapshot::text)<=1048576),
  expected_version integer not null check(expected_version>=0), lease_until timestamptz not null,
  started_at timestamptz not null default now(), finished_at timestamptz, error text, output_hash text,
  unique(user_id,request_key), unique(run_id,attempt_number),
  foreign key(user_id,run_id) references public.insight_runs(user_id,id)
);
alter table public.insight_runs enable row level security;
alter table public.insight_run_attempts enable row level security;
drop policy if exists insight_runs_owner on public.insight_runs;
create policy insight_runs_owner on public.insight_runs for select to authenticated using((select auth.uid())=user_id);
drop policy if exists insight_run_attempts_owner on public.insight_run_attempts;
create policy insight_run_attempts_owner on public.insight_run_attempts for select to authenticated using((select auth.uid())=user_id);
revoke all on public.insight_runs,public.insight_run_attempts from public,anon,authenticated;
grant select on public.insight_runs,public.insight_run_attempts to authenticated;

create or replace function public.guard_insight_attempt_update() returns trigger language plpgsql set search_path=public as $$
begin
  if old.status<>'running' or new.id<>old.id or new.user_id<>old.user_id or new.run_id<>old.run_id or new.request_key<>old.request_key
    or new.attempt_number<>old.attempt_number or new.base_snapshot<>old.base_snapshot or new.expected_version<>old.expected_version
    then raise exception 'Insight attempt input or completed history is immutable';end if;
  return new;
end$$;
drop trigger if exists insight_attempts_guard on public.insight_run_attempts;
create trigger insight_attempts_guard before update on public.insight_run_attempts for each row execute function public.guard_insight_attempt_update();

create or replace function public.claim_insight_run(p_date date,p_request_key uuid,p_base jsonb,p_empty boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_runs; a public.insight_run_attempts; next_id uuid:=gen_random_uuid(); n integer; deferred boolean; expected integer;
begin
  if owner_id is null then raise exception 'Authentication required';end if;
  if p_date is null or p_date >= (now() at time zone 'Asia/Shanghai')::date or p_request_key is null then raise exception 'Invalid Daily run';end if;
  perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
  select * into a from public.insight_run_attempts where user_id=owner_id and request_key=p_request_key;
  if a.id is not null then
    select * into r from public.insight_runs where id=a.run_id and user_id=owner_id;
    if r.date<>p_date then raise exception 'INSIGHT_REQUEST_CONFLICT';end if;
    return jsonb_build_object('run',to_jsonb(r),'attempt',to_jsonb(a));
  end if;
  select * into r from public.insight_runs where user_id=owner_id and date=p_date for update;
  if r.id is not null then
    if r.status='succeeded' or r.status='failed' or r.lease_until>now() and r.status='running' or r.next_retry_at>now() then
      return jsonb_build_object('run',to_jsonb(r),'attempt',null);
    end if;
    if r.status='running' then
      update public.insight_run_attempts set status='expired',finished_at=now(),error='Agent lease expired' where user_id=owner_id and id=r.current_attempt_id and status='running';
    end if;
    if r.attempt_count>=3 then
      update public.insight_runs set status='failed',last_error='Retry limit reached',lease_until=null,next_retry_at=null,updated_at=now() where id=r.id returning * into r;
      return jsonb_build_object('run',to_jsonb(r),'attempt',null);
    end if;
  end if;
  if p_base is null or jsonb_typeof(p_base)<>'object' or octet_length(p_base::text)>1048576 or p_base->>'method' is distinct from 'ai'
    or p_base->>'agent' is distinct from 'ChatGPT Scheduled Task' or jsonb_typeof(p_base->'input') is distinct from 'object'
    or coalesce(p_base#>>'{input,fingerprint}','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid frozen analysis input';end if;
  n:=coalesce(r.attempt_count,0)+1;deferred:=coalesce(p_empty,false) and n=1;
  select current_version into expected from public.insight_reports where user_id=owner_id and period_type='daily' and period_start=p_date;
  if r.id is null then
    insert into public.insight_runs(user_id,date,status,attempt_count,current_attempt_id) values(owner_id,p_date,'running',0,next_id) returning * into r;
  end if;
  insert into public.insight_run_attempts(id,user_id,run_id,attempt_number,request_key,status,base_snapshot,expected_version,lease_until,finished_at,error)
    values(next_id,owner_id,r.id,n,p_request_key,case when deferred then 'waiting_data' else 'running' end,p_base,coalesce(expected,0),now()+interval '30 minutes',
      case when deferred then now() else null end,case when deferred then 'No target-day observations; defer once for late records' else null end) returning * into a;
  update public.insight_runs set status=case when deferred then 'waiting_data' else 'running' end,attempt_count=n,current_attempt_id=next_id,
    lease_until=case when deferred then null else a.lease_until end,next_retry_at=case when deferred then now()+interval '1 hour' else null end,
    last_error=a.error,updated_at=now() where id=r.id returning * into r;
  return jsonb_build_object('run',to_jsonb(r),'attempt',to_jsonb(a));
end$$;

create or replace function public.finish_insight_run(p_attempt_id uuid,p_snapshot jsonb,p_output_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_runs; a public.insight_run_attempts; saved jsonb;
begin
  if owner_id is null then raise exception 'Authentication required';end if;
  perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
  select * into a from public.insight_run_attempts where user_id=owner_id and id=p_attempt_id for update;
  if a.id is null then raise exception 'INSIGHT_ATTEMPT_NOT_FOUND';end if;
  select * into r from public.insight_runs where user_id=owner_id and id=a.run_id for update;
  if a.status='succeeded' then
    if a.output_hash is distinct from p_output_hash then raise exception 'INSIGHT_OUTPUT_CONFLICT';end if;
    select jsonb_build_object('report',to_jsonb(report),'version',to_jsonb(v),'newly_completed',false,'run',to_jsonb(r)) into saved
      from public.insight_reports report join public.insight_report_versions v on v.report_id=report.id and v.version=r.report_version
      where report.user_id=owner_id and report.id=r.report_id;
    return saved;
  end if;
  if r.current_attempt_id<>a.id or r.status<>'running' or a.status<>'running' or a.lease_until<=now() then raise exception 'INSIGHT_LEASE_CONFLICT';end if;
  if p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or (p_snapshot->'input') is distinct from (a.base_snapshot->'input')
    or (p_snapshot->'evidence') is distinct from (a.base_snapshot->'evidence') or (p_snapshot->>'agent') is distinct from (a.base_snapshot->>'agent')
    or (p_snapshot->>'method') is distinct from 'ai' or (p_snapshot->>'revisionNote') is distinct from (a.base_snapshot->>'revisionNote')
    or not ((p_snapshot->'findings') @> (a.base_snapshot->'findings')) then raise exception 'INSIGHT_INPUT_BINDING_CONFLICT';end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'findings') f
    where not ((a.base_snapshot->'findings') @> jsonb_build_array(f)) and
      (coalesce(f->>'method','')<>'ai' or coalesce(f->>'id','') !~ '^ai-[a-zA-Z0-9_-]{1,80}$')) then raise exception 'INSIGHT_INPUT_BINDING_CONFLICT';end if;
  saved:=public.save_insight_report(r.date,r.date+1,a.expected_version,a.id,p_output_hash,p_snapshot);
  update public.insight_run_attempts set status='succeeded',finished_at=now(),output_hash=p_output_hash where id=a.id;
  update public.insight_runs set status='succeeded',lease_until=null,next_retry_at=null,last_error=null,
    report_id=(saved#>>'{report,id}')::uuid,report_version=(saved#>>'{version,version}')::integer,updated_at=now() where id=r.id returning * into r;
  return saved||jsonb_build_object('run',to_jsonb(r),'newly_completed',true);
end$$;

create or replace function public.fail_insight_run(p_attempt_id uuid,p_error text,p_retryable boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_runs; a public.insight_run_attempts;
begin
  if owner_id is null then raise exception 'Authentication required';end if;
  if p_error is null or length(btrim(p_error)) not between 1 and 1000 or p_retryable is null then raise exception 'Invalid run failure';end if;
  perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
  select * into a from public.insight_run_attempts where user_id=owner_id and id=p_attempt_id for update;
  if a.id is null then raise exception 'INSIGHT_ATTEMPT_NOT_FOUND';end if;
  select * into r from public.insight_runs where user_id=owner_id and id=a.run_id for update;
  if a.status<>'running' then return to_jsonb(r);end if;
  if r.current_attempt_id<>a.id then raise exception 'INSIGHT_LEASE_CONFLICT';end if;
  update public.insight_run_attempts set status='failed',finished_at=now(),error=p_error where id=a.id;
  update public.insight_runs set status=case when p_retryable and attempt_count<3 then 'waiting_retry' else 'failed' end,
    next_retry_at=case when p_retryable and attempt_count<3 then now()+interval '10 minutes' else null end,
    lease_until=null,last_error=p_error,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end$$;
revoke all on function public.claim_insight_run(date,uuid,jsonb,boolean),public.finish_insight_run(uuid,jsonb,text),public.fail_insight_run(uuid,text,boolean) from public,anon;
grant execute on function public.claim_insight_run(date,uuid,jsonb,boolean),public.finish_insight_run(uuid,jsonb,text),public.fail_insight_run(uuid,text,boolean) to authenticated;
commit;
