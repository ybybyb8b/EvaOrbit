begin;

alter table public.cat_routines
  add column if not exists recurrence_mode text not null default 'completion',
  add column if not exists anchor_date date,
  add column if not exists first_due_date date,
  add column if not exists next_due_date date,
  add column if not exists configured_reminder_time time,
  add column if not exists timezone text not null default 'Asia/Shanghai';

update public.cat_routines
set anchor_date=coalesce(anchor_date,(first_due_at at time zone timezone)::date),
    first_due_date=coalesce(first_due_date,(first_due_at at time zone timezone)::date),
    next_due_date=coalesce(next_due_date,(next_due_at at time zone timezone)::date),
    configured_reminder_time=coalesce(configured_reminder_time,(first_due_at at time zone timezone)::time);

alter table public.cat_routines
  alter column anchor_date set not null,
  alter column first_due_date set not null,
  alter column next_due_date set not null,
  alter column configured_reminder_time set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='cat_routines_recurrence_mode_check') then
    alter table public.cat_routines add constraint cat_routines_recurrence_mode_check check (recurrence_mode in ('completion','fixed'));
  end if;
end $$;

alter table public.tracker_reminders
  add column if not exists notification_mode text not null default 'missing',
  add column if not exists configured_time time not null default '20:00',
  add column if not exists period_days integer not null default 1,
  add column if not exists anchor_date date not null default ((timezone('Asia/Shanghai',now()))::date),
  add column if not exists next_due_at timestamptz,
  add column if not exists timezone text not null default 'Asia/Shanghai',
  add column if not exists reminder_id bigint unique references public.reminders(id) on delete set null;

update public.tracker_reminders
set notification_mode=case when reminder_type='scheduled' then 'standard' else 'missing' end,
    configured_time=case when schedule_rule ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then schedule_rule::time else configured_time end,
    period_days=coalesce(interval_days,1);

update public.tracker_reminders
set next_due_at=coalesce(next_due_at, (((anchor_date + case when notification_mode='missing' then period_days-1 else 0 end)::text || ' ' || configured_time::text)::timestamp at time zone timezone));

alter table public.tracker_reminders alter column next_due_at set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='tracker_reminders_notification_mode_check') then
    alter table public.tracker_reminders add constraint tracker_reminders_notification_mode_check check (notification_mode in ('standard','missing'));
  end if;
  if not exists (select 1 from pg_constraint where conname='tracker_reminders_period_days_check') then
    alter table public.tracker_reminders add constraint tracker_reminders_period_days_check check (period_days > 0);
  end if;
end $$;

insert into public.reminders(user_id,title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,due_has_explicit_time,interval_value,interval_unit,times_of_day,timezone,note,lead_time_minutes,status,is_active)
select tr.user_id,t.name,'tracker',tr.tracker_id,'tracker_'||tr.notification_mode,tr.id,'interval',tr.next_due_at,tr.next_due_at,true,tr.period_days,'day','[]'::jsonb,tr.timezone,'',0,case when tr.enabled then 'scheduled' else 'cancelled' end,tr.enabled
from public.tracker_reminders tr join public.trackers t on t.id=tr.tracker_id and t.user_id=tr.user_id
where tr.reminder_id is null;

update public.tracker_reminders tr set reminder_id=r.id
from public.reminders r
where r.user_id=tr.user_id and r.source_id=tr.id and r.source_type in ('tracker_standard','tracker_missing') and tr.reminder_id is null;

create unique index if not exists idx_tracker_notification_once
  on public.notification_deliveries(user_id,source_type,source_id,scheduled_at)
  where source_type in ('tracker_standard','tracker_missing');

commit;
