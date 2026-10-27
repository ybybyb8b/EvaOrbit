begin;
alter table public.insight_reports add column if not exists deleted_at timestamptz;
alter table public.insight_reports add column if not exists hidden_through_version integer not null default 0 check(hidden_through_version>=0);

create or replace function public.select_insight_reading_version() returns trigger language plpgsql set search_path=public as $$
declare chosen public.insight_report_versions;
begin
 select v.* into chosen from public.insight_report_versions v join public.insight_reports r on r.id=v.report_id and r.user_id=v.user_id
  where v.report_id=new.report_id and v.user_id=new.user_id and v.version>r.hidden_through_version
  order by (v.snapshot->>'method'='ai') desc,v.version desc limit 1;
 update public.insight_reports set reading_version=chosen.version,reading_method=chosen.snapshot->>'method',
  status=case when coalesce(jsonb_array_length(chosen.snapshot->'findings'),0)>0 then 'ready' else 'no_findings' end where id=new.report_id and user_id=new.user_id;
 return new;
end$$;
create or replace function public.guard_deleted_insight_write() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='insight_report_versions' then
  if exists(select 1 from public.insight_reports r where r.id=new.report_id and r.user_id=new.user_id and r.deleted_at is not null and new.version>r.hidden_through_version) then raise exception 'INSIGHT_REPORT_DELETED';end if;
 else
  if new.status='running' and exists(select 1 from public.insight_runs run join public.insight_reports r on r.user_id=run.user_id and r.period_type='daily' and r.period_start=run.date where run.id=new.run_id and run.user_id=new.user_id and r.deleted_at is not null) then raise exception 'INSIGHT_REPORT_DELETED';end if;
 end if;
 return new;
end$$;
drop trigger if exists insight_deleted_version_guard on public.insight_report_versions;
create trigger insight_deleted_version_guard before insert on public.insight_report_versions for each row execute function public.guard_deleted_insight_write();
drop trigger if exists insight_deleted_attempt_guard on public.insight_run_attempts;
create trigger insight_deleted_attempt_guard before insert on public.insight_run_attempts for each row execute function public.guard_deleted_insight_write();

create or replace function public.delete_insight_report(p_report_id uuid,p_expected_version integer,p_expected_generation integer)
returns void language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r public.insight_reports; current_generation integer;
begin
 if owner_id is null then raise exception 'Authentication required';end if;
 if p_expected_version is null or p_expected_version<1 or p_expected_generation is null or p_expected_generation<0 then raise exception 'Invalid delete version';end if;
 perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
 select * into r from public.insight_reports where id=p_report_id and user_id=owner_id for update;
 if r.id is null then raise exception 'INSIGHT_REPORT_NOT_FOUND';end if;
 if r.deleted_at is not null then return;end if;
 if r.current_version<>p_expected_version then raise exception 'INSIGHT_VERSION_CONFLICT';end if;
 select generation into current_generation from public.insight_runs where user_id=owner_id and date=r.period_start and r.period_type='daily';
 if coalesce(current_generation,0)<>p_expected_generation then raise exception 'INSIGHT_GENERATION_CONFLICT';end if;
 update public.insight_run_attempts a set status='failed',finished_at=now(),error='Report deleted by user'
  from public.insight_runs run where a.run_id=run.id and a.user_id=owner_id and a.status='running' and run.user_id=owner_id and run.date=r.period_start and r.period_type='daily';
 update public.insight_runs set status='failed',lease_until=null,next_retry_at=null,last_error='Report deleted by user',updated_at=now()
  where user_id=owner_id and date=r.period_start and r.period_type='daily';
 update public.insight_reports set deleted_at=now(),hidden_through_version=current_version,reading_version=null,reading_method=null,updated_at=now() where id=r.id;
end$$;

create or replace function public.queue_insight_run_review(p_date date,p_fingerprint text,p_expected_generation integer)
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
create or replace function public.queue_insight_run(p_date date,p_fingerprint text,p_expected_generation integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); report public.insight_reports; run public.insight_runs;
begin
 if owner_id is null then raise exception 'Authentication required';end if;
 if p_date is null or p_date >= (now() at time zone 'Asia/Shanghai')::date or coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' or p_expected_generation is null then raise exception 'Invalid reanalysis request';end if;
 perform pg_advisory_xact_lock(hashtextextended('insight-report:'||owner_id::text,0));
 select * into report from public.insight_reports where user_id=owner_id and period_type='daily' and period_start=p_date for update;
 if report.deleted_at is not null then
  perform public.require_insight_meals(p_date);
  select * into run from public.insight_runs where user_id=owner_id and date=p_date for update;
  if coalesce(run.generation,0)<>p_expected_generation then raise exception 'INSIGHT_GENERATION_CONFLICT';end if;
  update public.insight_reports set deleted_at=null,updated_at=now() where id=report.id;
  if run.id is not null then
   update public.insight_runs set generation=generation+1,input_fingerprint=p_fingerprint,attempt_count=0,status='waiting_retry',current_attempt_id=null,lease_until=null,next_retry_at=now(),last_error=null,updated_at=now() where id=run.id returning * into run;
   return to_jsonb(run);
  end if;
 end if;
 return public.queue_insight_run_review(p_date,p_fingerprint,p_expected_generation);
end$$;
revoke all on function public.queue_insight_run_review(date,text,integer),public.guard_deleted_insight_write() from public,anon,authenticated;
revoke all on function public.delete_insight_report(uuid,integer,integer) from public,anon;
grant execute on function public.delete_insight_report(uuid,integer,integer) to authenticated;
commit;
