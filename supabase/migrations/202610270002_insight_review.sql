begin;
alter table public.insight_reports add column if not exists reading_version integer;
alter table public.insight_reports add column if not exists reading_method text check(reading_method in ('rule','ai'));
alter table public.insight_runs add column if not exists generation integer not null default 1 check(generation>0);
alter table public.insight_runs add column if not exists input_fingerprint text;
alter table public.insight_runs alter column current_attempt_id drop not null;
alter table public.insight_run_attempts add column if not exists generation integer not null default 1 check(generation>0);
alter table public.insight_run_attempts drop constraint if exists insight_run_attempts_run_id_attempt_number_key;
create unique index if not exists insight_attempt_generation_unique on public.insight_run_attempts(run_id,generation,attempt_number);
update public.insight_runs r set input_fingerprint=a.base_snapshot#>>'{input,fingerprint}' from public.insight_run_attempts a where a.id=r.current_attempt_id and r.input_fingerprint is null;
create or replace function public.select_insight_reading_version() returns trigger language plpgsql set search_path=public as $$
declare chosen public.insight_report_versions;
begin
 select * into chosen from public.insight_report_versions where report_id=new.report_id and user_id=new.user_id order by (snapshot->>'method'='ai') desc,version desc limit 1;
 update public.insight_reports set reading_version=chosen.version,reading_method=chosen.snapshot->>'method',status=case when jsonb_array_length(chosen.snapshot->'findings')>0 then 'ready' else 'no_findings' end where id=new.report_id and user_id=new.user_id;
 return new;
end$$;
drop trigger if exists insight_reading_version on public.insight_report_versions;
create trigger insight_reading_version after insert on public.insight_report_versions for each row execute function public.select_insight_reading_version();
with chosen as (select distinct on(report_id) report_id,version,snapshot->>'method' as method,jsonb_array_length(snapshot->'findings') as finding_count from public.insight_report_versions order by report_id,(snapshot->>'method'='ai') desc,version desc)
 update public.insight_reports r set reading_version=c.version,reading_method=c.method,status=case when c.finding_count>0 then 'ready' else 'no_findings' end from chosen c where c.report_id=r.id;
create or replace function public.require_insight_meals(p_date date) returns void language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.food_logs where user_id=auth.uid() and meal_type='lunch' and occurred_at>=p_date::timestamp at time zone 'Asia/Shanghai' and occurred_at<(p_date+1)::timestamp at time zone 'Asia/Shanghai')
 or not exists(select 1 from public.food_logs where user_id=auth.uid() and meal_type='dinner' and occurred_at>=p_date::timestamp at time zone 'Asia/Shanghai' and occurred_at<(p_date+1)::timestamp at time zone 'Asia/Shanghai') then raise exception 'INSIGHT_MISSING_MEALS';end if;
end$$;
create or replace function public.guard_insight_attempt_update() returns trigger language plpgsql set search_path=public as $$
begin
  if old.status<>'running' or new.id<>old.id or new.user_id<>old.user_id or new.run_id<>old.run_id or new.request_key<>old.request_key
    or new.generation<>old.generation or new.attempt_number<>old.attempt_number or new.base_snapshot<>old.base_snapshot or new.expected_version<>old.expected_version
    then raise exception 'Insight attempt input or completed history is immutable';end if;
  return new;
end$$;

create or replace function public.save_insight_report_snapshot(p_date date,p_period_end date,p_expected_version integer,p_request_key uuid,p_request_hash text,p_snapshot jsonb)
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

create or replace function public.save_insight_report(p_date date,p_period_end date,p_expected_version integer,p_request_key uuid,p_request_hash text,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved jsonb; r public.insight_reports;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from public.insight_report_versions where user_id=auth.uid() and request_key=p_request_key) then
  perform public.require_insight_meals(p_date);
  if p_snapshot#>>'{input,fingerprintVersion}' is distinct from '2' then raise exception 'INSIGHT_RECAPTURE_REQUIRED';end if;
 end if;
 saved:=public.save_insight_report_snapshot(p_date,p_period_end,p_expected_version,p_request_key,p_request_hash,p_snapshot);
 update public.insight_reports report set status=case when jsonb_array_length(v.snapshot->'findings')>0 then 'ready' else 'no_findings' end from public.insight_report_versions v where report.id=(saved#>>'{report,id}')::uuid and report.user_id=auth.uid() and v.report_id=report.id and v.version=report.reading_version returning report.* into r;
 return saved||jsonb_build_object('report',to_jsonb(r));
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
      from public.insight_reports report join public.insight_report_versions v on v.report_id=report.id and v.request_key=a.id
      where report.user_id=owner_id and report.id=r.report_id;
    return saved;
  end if;
  if r.current_attempt_id is distinct from a.id or r.status<>'running' or a.status<>'running' or a.lease_until<=now() then raise exception 'INSIGHT_LEASE_CONFLICT';end if;
  if p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or (p_snapshot->'input') is distinct from (a.base_snapshot->'input')
    or (p_snapshot->'evidence') is distinct from (a.base_snapshot->'evidence') or (p_snapshot->>'agent') is distinct from (a.base_snapshot->>'agent')
    or (p_snapshot->>'method') is distinct from 'ai' or (p_snapshot->>'revisionNote') is distinct from (a.base_snapshot->>'revisionNote')
    or (coalesce(a.base_snapshot#>>'{input,fingerprintVersion}','1')<>'2' and not ((p_snapshot->'findings') @> (a.base_snapshot->'findings'))) then raise exception 'INSIGHT_INPUT_BINDING_CONFLICT';end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'findings') f
    where not ((a.base_snapshot->'findings') @> jsonb_build_array(f)) and
      (coalesce(f->>'method','')<>'ai' or coalesce(f->>'id','') !~ '^ai-[a-zA-Z0-9_-]{1,80}$')) then raise exception 'INSIGHT_INPUT_BINDING_CONFLICT';end if;
  saved:=public.save_insight_report(r.date,r.date+1,a.expected_version,a.id,p_output_hash,p_snapshot);
  update public.insight_run_attempts set status='succeeded',finished_at=now(),output_hash=p_output_hash where id=a.id;
  update public.insight_runs set status='succeeded',lease_until=null,next_retry_at=null,last_error=null,
    report_id=(saved#>>'{report,id}')::uuid,report_version=(saved#>>'{version,version}')::integer,updated_at=now() where id=r.id returning * into r;
  return saved||jsonb_build_object('run',to_jsonb(r),'newly_completed',true);
end$$;

create or replace function public.claim_insight_run(p_date date,p_request_key uuid,p_base jsonb,p_empty boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_runs; a public.insight_run_attempts; next_id uuid:=gen_random_uuid(); expected integer; fingerprint text:=p_base#>>'{input,fingerprint}';
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
 perform public.require_insight_meals(p_date);
 if p_base is null or octet_length(p_base::text)>1048576 or p_base->>'method' is distinct from 'ai' or p_base->>'agent' is distinct from 'ChatGPT Scheduled Task'
 or p_base#>>'{input,fingerprintVersion}' is distinct from '2' or coalesce(fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid frozen analysis input';end if;
 select * into r from public.insight_runs where user_id=owner_id and date=p_date for update;
 if r.id is not null then
  if r.status='running' and r.lease_until>now() then return jsonb_build_object('run',to_jsonb(r),'attempt',null);end if;
  if r.status='running' then update public.insight_run_attempts set status='expired',finished_at=now(),error='Agent lease expired' where id=r.current_attempt_id and user_id=owner_id and status='running';end if;
  if r.input_fingerprint is distinct from fingerprint then
   update public.insight_runs set generation=generation+1,attempt_count=0,status='waiting_retry',lease_until=null,next_retry_at=null,input_fingerprint=fingerprint,last_error=null where id=r.id returning * into r;
  elsif r.status in ('succeeded','failed') or r.next_retry_at>now() then return jsonb_build_object('run',to_jsonb(r),'attempt',null);
  end if;
  if r.attempt_count>=3 then
   update public.insight_runs set status='failed',lease_until=null,next_retry_at=null,last_error='Retry limit reached',updated_at=now() where id=r.id returning * into r;
   return jsonb_build_object('run',to_jsonb(r),'attempt',null);
  end if;
 else
  insert into public.insight_runs(user_id,date,status,attempt_count,current_attempt_id,input_fingerprint) values(owner_id,p_date,'waiting_retry',0,next_id,fingerprint) returning * into r;
 end if;
 select current_version into expected from public.insight_reports where user_id=owner_id and period_type='daily' and period_start=p_date;
 insert into public.insight_run_attempts(id,user_id,run_id,generation,attempt_number,request_key,status,base_snapshot,expected_version,lease_until)
 values(next_id,owner_id,r.id,r.generation,r.attempt_count+1,p_request_key,'running',p_base,coalesce(expected,0),now()+interval '30 minutes') returning * into a;
 update public.insight_runs set status='running',attempt_count=attempt_count+1,current_attempt_id=a.id,lease_until=a.lease_until,next_retry_at=null,last_error=null,updated_at=now() where id=r.id returning * into r;
 return jsonb_build_object('run',to_jsonb(r),'attempt',to_jsonb(a));
end$$;

create or replace function public.queue_insight_run(p_date date,p_fingerprint text,p_expected_generation integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_runs;
begin
 if owner_id is null then raise exception 'Authentication required';end if;
 if p_date is null or p_date >= (now() at time zone 'Asia/Shanghai')::date or coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' or p_expected_generation is null then raise exception 'Invalid reanalysis request';end if;
 perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
 perform public.require_insight_meals(p_date);
 select * into r from public.insight_runs where user_id=owner_id and date=p_date for update;
 if r.id is null then
  if p_expected_generation<>0 then raise exception 'INSIGHT_GENERATION_CONFLICT';end if;
  insert into public.insight_runs(user_id,date,status,attempt_count,current_attempt_id,input_fingerprint,next_retry_at) values(owner_id,p_date,'waiting_retry',0,null,p_fingerprint,now()) returning * into r;
 elsif r.input_fingerprint=p_fingerprint then
  if r.status='failed' then raise exception 'INSIGHT_RETRY_LIMIT';end if;
  return to_jsonb(r);
 else
  if r.generation<>p_expected_generation then raise exception 'INSIGHT_GENERATION_CONFLICT';end if;
  update public.insight_run_attempts set status='expired',finished_at=now(),error='Records updated; a new analysis was requested' where id=r.current_attempt_id and user_id=owner_id and status='running';
  update public.insight_runs set generation=generation+1,input_fingerprint=p_fingerprint,attempt_count=0,status='waiting_retry',current_attempt_id=null,lease_until=null,next_retry_at=now(),last_error=null,updated_at=now() where id=r.id returning * into r;
 end if;
 return to_jsonb(r);
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
  if r.current_attempt_id is distinct from a.id then raise exception 'INSIGHT_LEASE_CONFLICT';end if;
  update public.insight_run_attempts set status='failed',finished_at=now(),error=p_error where id=a.id;
  update public.insight_runs set status=case when p_retryable and attempt_count<3 then 'waiting_retry' else 'failed' end,
    next_retry_at=case when p_retryable and attempt_count<3 then now()+interval '10 minutes' else null end,
    lease_until=null,last_error=p_error,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end$$;

revoke all on function public.save_insight_report_snapshot(date,date,integer,uuid,text,jsonb),public.require_insight_meals(date),public.select_insight_reading_version() from public,anon,authenticated;
revoke all on function public.queue_insight_run(date,text,integer) from public,anon;
grant execute on function public.queue_insight_run(date,text,integer),public.save_insight_report(date,date,integer,uuid,text,jsonb),public.claim_insight_run(date,uuid,jsonb,boolean),public.finish_insight_run(uuid,jsonb,text) to authenticated;
commit;
