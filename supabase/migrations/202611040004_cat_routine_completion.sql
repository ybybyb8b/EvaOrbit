begin;

-- One lock covers the occurrence, its care record, and the reminder projection.
create or replace function public.complete_cat_routine_occurrence(
  p_id bigint, p_expected_due_at timestamptz, p_expected_completed_at timestamptz,
  p_completed_at timestamptz, p_anchor_date date, p_next_due_date date, p_next_due_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.cat_routines; e public.cat_events;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_completed_at is null or p_anchor_date is null or p_next_due_date is null or p_next_due_at is null then
    raise exception 'Invalid routine completion';
  end if;
  select * into r from public.cat_routines where id=p_id and user_id=auth.uid() for update;
  if not found or not r.enabled or r.next_due_at is distinct from p_expected_due_at
    or r.last_completed_at is distinct from p_expected_completed_at then return null; end if;
  insert into public.cat_events(user_id,pet_id,event_type,occurred_at,occurred_has_explicit_time,title,note,source_type,source_id)
    values(auth.uid(),case when r.scope='cat' then r.pet_id else null end,
      case when r.scope='cat' then 'care' else 'cleaning' end,p_completed_at,true,r.title,r.notes,'cat_routine',r.id)
    returning * into e;
  update public.cat_routines set last_completed_at=p_completed_at,anchor_date=p_anchor_date,
    next_due_date=p_next_due_date,next_due_at=p_next_due_at,updated_at=now() where id=r.id;
  if r.reminder_id is not null then
    insert into public.reminder_occurrences(user_id,reminder_id,action,scheduled_for,acted_at,created_event_id)
      values(auth.uid(),r.reminder_id,'completed',r.next_due_at,p_completed_at,e.id);
    update public.reminders set next_due_at=p_next_due_at,last_completed_at=p_completed_at,status='scheduled',
      sent_at=null,cancelled_at=null,snoozed_until=null,last_notified_at=null,is_active=true,updated_at=now()
      where id=r.reminder_id and user_id=auth.uid();
    if not found then raise exception 'Routine reminder not found'; end if;
  end if;
  select * into r from public.cat_routines where id=p_id and user_id=auth.uid();
  return jsonb_build_object('routine',to_jsonb(r),'event',to_jsonb(e));
end $$;
revoke all on function public.complete_cat_routine_occurrence(bigint,timestamptz,timestamptz,timestamptz,date,date,timestamptz) from public,anon;
grant execute on function public.complete_cat_routine_occurrence(bigint,timestamptz,timestamptz,timestamptz,date,date,timestamptz) to authenticated;

commit;
