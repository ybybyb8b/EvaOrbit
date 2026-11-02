begin;
create table if not exists public.training_suggestion_exclusions (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check(kind in ('teacher','course','exercise')),
  value text not null check(length(btrim(value)) between 1 and 160),
  primary key(user_id,kind,value)
);
alter table public.training_suggestion_exclusions enable row level security;
drop policy if exists training_suggestion_exclusions_owner on public.training_suggestion_exclusions;
create policy training_suggestion_exclusions_owner on public.training_suggestion_exclusions for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.training_suggestion_exclusions from public,anon;
grant select,insert,update,delete on public.training_suggestion_exclusions to authenticated;
commit;
