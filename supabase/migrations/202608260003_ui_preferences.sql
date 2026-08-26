create table if not exists public.ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_module_order jsonb not null default '["inbox","eva","trackers","food","drinks","cats","people","media","chronicle","settings"]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ui_preferences_home_order_array check (jsonb_typeof(home_module_order) = 'array')
);

do $$ begin
  execute 'drop trigger if exists ui_preferences_set_updated_at on public.ui_preferences';
  execute 'create trigger ui_preferences_set_updated_at before update on public.ui_preferences for each row execute function public.set_updated_at()';
end $$;

alter table public.ui_preferences enable row level security;
do $$
declare action text;
begin
  foreach action in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists ui_preferences_owner_%s on public.ui_preferences', action);
  end loop;
end $$;
create policy ui_preferences_owner_select on public.ui_preferences for select using (auth.uid() = user_id);
create policy ui_preferences_owner_insert on public.ui_preferences for insert with check (auth.uid() = user_id);
create policy ui_preferences_owner_update on public.ui_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ui_preferences_owner_delete on public.ui_preferences for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.ui_preferences to authenticated;
