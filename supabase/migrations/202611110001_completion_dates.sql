begin;

alter table public.tasks add column if not exists completed_on date;
alter table public.reminder_occurrences add column if not exists completed_on date;
alter table public.cat_routines add column if not exists last_completed_on date;
alter table public.cat_routines add column if not exists completion_undo jsonb;
create index if not exists idx_tasks_completed_on on public.tasks(user_id,completed_on) where completed_on is not null;
create index if not exists idx_reminder_occurrences_completed_on on public.reminder_occurrences(user_id,completed_on) where completed_on is not null;

-- Completion-generated events used the button timestamp. Keep the original
-- timestamp for old records and keep explicitly edited events at their saved precision.
update public.cat_events set occurred_has_explicit_time=false
where source_type in ('cat_routine','reminder') and created_at=updated_at and occurred_has_explicit_time;

create or replace function public.complete_cat_routine_occurrence(
  p_id bigint, p_expected_due_at timestamptz, p_expected_completed_at timestamptz,
  p_completed_at timestamptz, p_anchor_date date, p_next_due_date date, p_next_due_at timestamptz,
  p_completed_on date, p_occurred_at timestamptz, p_previous_completed_on date
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.cat_routines; n public.reminders; e public.cat_events; receipt jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_completed_on is null or p_occurred_at is null or p_completed_at is null then raise exception 'Invalid routine completion'; end if;
  select * into r from public.cat_routines where id=p_id and user_id=auth.uid() for update;
  if not found or not r.enabled or r.next_due_at is distinct from p_expected_due_at
    or r.last_completed_at is distinct from p_expected_completed_at
    or r.last_completed_on >= p_completed_on then return null; end if;
  if r.reminder_id is not null then
    select * into n from public.reminders where id=r.reminder_id and user_id=auth.uid() for update;
    if not found then raise exception 'Routine reminder not found'; end if;
  end if;
  insert into public.cat_events(user_id,pet_id,event_type,occurred_at,occurred_has_explicit_time,title,note,source_type,source_id)
    values(auth.uid(),case when r.scope='cat' then r.pet_id else null end,
      case when r.scope='cat' then 'care' else 'cleaning' end,p_occurred_at,false,r.title,r.notes,'cat_routine',r.id)
    returning * into e;
  receipt := jsonb_build_object('eventId',e.id,'nextDueAt',p_next_due_at,
    'previousCompletedOn',coalesce(r.last_completed_on,p_previous_completed_on),
    'before',jsonb_build_object('anchorDate',r.anchor_date,'nextDueDate',r.next_due_date,'nextDueAt',r.next_due_at,
      'lastCompletedAt',r.last_completed_at,'lastCompletedOn',r.last_completed_on),
    'reminder',case when n.id is null then null else jsonb_build_object('id',n.id,'nextDueAt',n.next_due_at,
      'lastCompletedAt',n.last_completed_at,'status',n.status,'sentAt',n.sent_at,'cancelledAt',n.cancelled_at,
      'snoozedUntil',n.snoozed_until,'lastNotifiedAt',n.last_notified_at,'isActive',n.is_active) end);
  update public.cat_routines set last_completed_at=p_completed_at,last_completed_on=p_completed_on,
    anchor_date=p_anchor_date,next_due_date=p_next_due_date,next_due_at=p_next_due_at,completion_undo=receipt,updated_at=now()
    where id=r.id returning * into r;
  if n.id is not null then
    insert into public.reminder_occurrences(user_id,reminder_id,action,scheduled_for,acted_at,completed_on,created_event_id)
      values(auth.uid(),n.id,'completed',(receipt#>>'{before,nextDueAt}')::timestamptz,p_completed_at,p_completed_on,e.id);
    update public.reminders set next_due_at=p_next_due_at,last_completed_at=p_completed_at,status='scheduled',
      sent_at=null,cancelled_at=null,snoozed_until=null,last_notified_at=null,is_active=true,updated_at=now() where id=n.id;
  end if;
  return jsonb_build_object('routine',to_jsonb(r),'event',to_jsonb(e));
end $$;

create or replace function public.change_cat_completion(p_event_id bigint,p_edit jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.cat_events; r public.cat_routines; n public.reminders; receipt jsonb;
  latest boolean := false; d date; next_date date; next_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into e from public.cat_events where id=p_event_id and user_id=auth.uid() for update;
  if not found or e.source_type is null or e.source_type not in ('cat_routine','reminder') then return null; end if;
  if e.source_type='cat_routine' then
    select * into r from public.cat_routines where id=e.source_id and user_id=auth.uid() for update;
    receipt := r.completion_undo;
    latest := coalesce(r.enabled and (receipt->>'eventId')::bigint=e.id
      and r.next_due_at=(receipt->>'nextDueAt')::timestamptz,false);
    if latest and r.reminder_id is not null then
      select * into n from public.reminders where id=r.reminder_id and user_id=auth.uid() for update;
      latest := coalesce(found and n.is_active and n.id=(receipt#>>'{reminder,id}')::bigint
        and n.next_due_at is not distinct from r.next_due_at and n.last_completed_at is not distinct from r.last_completed_at
        and n.snoozed_until is null,false);
    elsif latest then
      latest := coalesce(receipt->'reminder' = 'null'::jsonb,false);
    end if;
  end if;

  if p_edit is null or (p_edit->>'deleteHistory')::boolean then
    if p_edit is null and not latest then return null; end if;
    delete from public.reminder_occurrences where user_id=auth.uid() and created_event_id=e.id and action='completed';
    delete from public.cat_events where id=e.id;
    if latest then
      update public.cat_routines set anchor_date=(receipt#>>'{before,anchorDate}')::date,
        next_due_date=(receipt#>>'{before,nextDueDate}')::date,next_due_at=(receipt#>>'{before,nextDueAt}')::timestamptz,
        last_completed_at=(receipt#>>'{before,lastCompletedAt}')::timestamptz,last_completed_on=(receipt#>>'{before,lastCompletedOn}')::date,
        completion_undo=null,updated_at=now() where id=r.id;
      if n.id is not null then
        update public.reminders set next_due_at=(receipt#>>'{reminder,nextDueAt}')::timestamptz,
          last_completed_at=(receipt#>>'{reminder,lastCompletedAt}')::timestamptz,status=receipt#>>'{reminder,status}',
          sent_at=(receipt#>>'{reminder,sentAt}')::timestamptz,cancelled_at=(receipt#>>'{reminder,cancelledAt}')::timestamptz,
          snoozed_until=(receipt#>>'{reminder,snoozedUntil}')::timestamptz,last_notified_at=(receipt#>>'{reminder,lastNotifiedAt}')::timestamptz,
          is_active=(receipt#>>'{reminder,isActive}')::boolean,updated_at=now() where id=n.id;
      end if;
    end if;
    return to_jsonb(e);
  end if;

  d := (p_edit->>'completedOn')::date;
  if latest and d is distinct from r.last_completed_on then
    if d <= (receipt->>'previousCompletedOn')::date then return null; end if;
    if r.recurrence_mode='completion' then
      next_date := (d + make_interval(days => case r.interval_unit when 'day' then r.interval_value when 'week' then 7*r.interval_value else 0 end,
        months => case when r.interval_unit='month' then r.interval_value else 0 end))::date;
      next_at := (next_date + r.configured_reminder_time) at time zone r.timezone;
      update public.cat_routines set last_completed_on=d,anchor_date=d,next_due_date=next_date,next_due_at=next_at,
        completion_undo=jsonb_set(receipt,'{nextDueAt}',to_jsonb(next_at)),updated_at=now() where id=r.id;
      update public.reminders set next_due_at=next_at,status='scheduled',sent_at=null,last_notified_at=null,updated_at=now() where id=n.id;
    else
      update public.cat_routines set last_completed_on=d,updated_at=now() where id=r.id;
    end if;
  end if;
  update public.cat_events set occurred_at=(p_edit->>'occurredAt')::timestamptz,
    occurred_has_explicit_time=(p_edit->>'occurredHasExplicitTime')::boolean,
    title=coalesce(p_edit->>'title',title),note=coalesce(p_edit->>'note',note),updated_at=now()
    where id=e.id returning * into e;
  update public.reminder_occurrences set completed_on=d where user_id=auth.uid() and created_event_id=e.id and action='completed';
  return to_jsonb(e);
end $$;

create or replace function public.correct_reminder_completion(
  p_reminder_id bigint,p_occurrence_id bigint,p_completed_on date,p_schedule jsonb
) returns boolean language plpgsql security invoker set search_path=public as $$
declare n public.reminders; o public.reminder_occurrences;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into n from public.reminders where id=p_reminder_id and user_id=auth.uid() for update;
  if not found then return false; end if;
  select * into o from public.reminder_occurrences where id=p_occurrence_id and reminder_id=n.id
    and user_id=auth.uid() and action='completed' and created_event_id is null for update;
  if not found then return false; end if;
  if p_schedule is not null then
    if n.status='cancelled' or n.last_completed_at is distinct from o.acted_at or n.next_due_at is distinct from (p_schedule->>'expectedNextDueAt')::timestamptz
      or n.snoozed_until is not null then return false; end if;
    update public.reminders set next_due_at=(p_schedule->>'nextDueAt')::timestamptz,
      is_active=(p_schedule->>'isActive')::boolean,status='scheduled',sent_at=null,last_notified_at=null,updated_at=now() where id=n.id;
  end if;
  update public.reminder_occurrences set completed_on=p_completed_on where id=o.id;
  return true;
end $$;

revoke all on function public.complete_cat_routine_occurrence(bigint,timestamptz,timestamptz,timestamptz,date,date,timestamptz,date,timestamptz,date),
  public.change_cat_completion(bigint,jsonb), public.correct_reminder_completion(bigint,bigint,date,jsonb) from public,anon;
grant execute on function public.complete_cat_routine_occurrence(bigint,timestamptz,timestamptz,timestamptz,date,date,timestamptz,date,timestamptz,date),
  public.change_cat_completion(bigint,jsonb), public.correct_reminder_completion(bigint,bigint,date,jsonb) to authenticated;

commit;
