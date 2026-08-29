create or replace function public.record_lucius_case_recurrence(
  p_case_id bigint,
  p_occurred_date date default ((now() at time zone 'Asia/Shanghai')::date)
)
returns setof public.lucius_cases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_date date;
  updated_case public.lucius_cases%rowtype;
begin
  select latest_occurred_date
    into previous_date
    from public.lucius_cases
   where id = p_case_id
     and user_id = (select auth.uid())
   for update;

  if not found then
    return;
  end if;

  if p_occurred_date < previous_date then
    raise exception 'recurrence date cannot be earlier than latest occurrence date'
      using errcode = '22007';
  end if;

  update public.lucius_cases
     set occurrence_count = occurrence_count + 1,
         latest_occurred_date = p_occurred_date,
         recurrence_interval_days = nullif(p_occurred_date - previous_date, 0),
         is_recurrence = true,
         consecutive_correct_count = 0
   where id = p_case_id
     and user_id = (select auth.uid())
  returning * into updated_case;

  return next updated_case;
end;
$$;

revoke all on function public.record_lucius_case_recurrence(bigint, date) from public;
grant execute on function public.record_lucius_case_recurrence(bigint, date) to authenticated;
