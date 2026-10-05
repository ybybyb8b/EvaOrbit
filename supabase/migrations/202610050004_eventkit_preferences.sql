begin;
create table if not exists public.eventkit_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  preferences jsonb not null check(coalesce(jsonb_typeof(preferences)='object' and preferences->>'version'='1' and jsonb_typeof(preferences->'sources')='array' and jsonb_typeof(preferences->'routes')='object' and octet_length(preferences::text)<=524288,false)),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
alter table public.eventkit_preferences enable row level security;
drop policy if exists eventkit_preferences_owner_select on public.eventkit_preferences;
create policy eventkit_preferences_owner_select on public.eventkit_preferences for select to authenticated using((select auth.uid())=user_id);
revoke all on public.eventkit_preferences from public,anon,authenticated;
grant select on public.eventkit_preferences to authenticated;
create or replace function public.save_eventkit_preferences(p_preferences jsonb,p_revision bigint)
returns public.eventkit_preferences language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.eventkit_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_revision is null or p_revision<0 then raise exception 'Invalid preference revision'; end if;
  insert into public.eventkit_preferences(user_id,preferences) values(auth.uid(),p_preferences)
  on conflict(user_id) do update set preferences=excluded.preferences,revision=eventkit_preferences.revision+1,updated_at=now()
  where eventkit_preferences.revision=p_revision
  returning * into saved;
  if saved.user_id is null then raise exception 'EventKit preference revision conflict'; end if;
  -- A nonzero revision cannot recreate a preference row removed concurrently.
  if saved.revision=1 and p_revision<>0 then raise exception 'EventKit preference revision conflict'; end if;
  return saved;
end; $$;
revoke all on function public.save_eventkit_preferences(jsonb,bigint) from public,anon;
grant execute on function public.save_eventkit_preferences(jsonb,bigint) to authenticated;
commit;
