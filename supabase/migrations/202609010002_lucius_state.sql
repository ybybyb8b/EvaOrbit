create table if not exists public.lucius_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  current_note text not null default '' check (char_length(current_note) <= 2000),
  status text not null default 'quiet' check (char_length(btrim(status)) between 1 and 80),
  mood text not null default 'composed' check (char_length(btrim(mood)) between 1 and 80),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists lucius_state_set_updated_at on public.lucius_state;
create trigger lucius_state_set_updated_at before update on public.lucius_state
for each row execute function public.set_updated_at();

alter table public.lucius_state enable row level security;

drop policy if exists lucius_state_owner_all on public.lucius_state;
create policy lucius_state_owner_all on public.lucius_state for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

grant select, insert on table public.lucius_state to authenticated;
grant update (current_note, status, mood) on table public.lucius_state to authenticated;
