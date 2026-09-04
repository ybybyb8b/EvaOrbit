begin;

create table if not exists public.meal_reminder_rules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner')),
  remind_at time not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(user_id,meal_type)
);

insert into public.meal_reminder_rules(user_id,meal_type,remind_at,enabled)
select preferences.user_id,defaults.meal_type,defaults.remind_at::time,true
from public.ui_preferences preferences
cross join (values ('breakfast','10:00'),('lunch','14:00'),('dinner','20:00')) as defaults(meal_type,remind_at)
on conflict(user_id,meal_type) do nothing;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_target_type_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_target_type_check check (target_type in ('cat','cat_household','tracker','food'));

create unique index if not exists idx_meal_notification_once
  on public.notification_deliveries(user_id,target_type,target_id,scheduled_at)
  where source_type='meal_missing';

drop trigger if exists meal_reminder_rules_set_updated_at on public.meal_reminder_rules;
create trigger meal_reminder_rules_set_updated_at before update on public.meal_reminder_rules
for each row execute function public.set_updated_at();

alter table public.meal_reminder_rules enable row level security;

drop policy if exists meal_reminder_rules_owner_select on public.meal_reminder_rules;
drop policy if exists meal_reminder_rules_owner_insert on public.meal_reminder_rules;
drop policy if exists meal_reminder_rules_owner_update on public.meal_reminder_rules;
drop policy if exists meal_reminder_rules_owner_delete on public.meal_reminder_rules;
create policy meal_reminder_rules_owner_select on public.meal_reminder_rules for select to authenticated using ((select auth.uid())=user_id);
create policy meal_reminder_rules_owner_insert on public.meal_reminder_rules for insert to authenticated with check ((select auth.uid())=user_id);
create policy meal_reminder_rules_owner_update on public.meal_reminder_rules for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy meal_reminder_rules_owner_delete on public.meal_reminder_rules for delete to authenticated using ((select auth.uid())=user_id);

revoke all on public.meal_reminder_rules from anon;
grant select,insert,update,delete on public.meal_reminder_rules to authenticated;
grant select on public.meal_reminder_rules to service_role;
grant update on public.notification_deliveries to service_role;

commit;
