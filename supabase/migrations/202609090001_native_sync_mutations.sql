begin;

create table if not exists public.native_sync_mutations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_json jsonb not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  result_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, mutation_id),
  check ((status = 'processing' and result_json is null) or (status = 'completed' and result_json is not null))
);

drop trigger if exists native_sync_mutations_set_updated_at on public.native_sync_mutations;
create trigger native_sync_mutations_set_updated_at before update on public.native_sync_mutations for each row execute function public.set_updated_at();

alter table public.native_sync_mutations enable row level security;
drop policy if exists native_sync_mutations_owner_select on public.native_sync_mutations;
create policy native_sync_mutations_owner_select on public.native_sync_mutations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists native_sync_mutations_owner_insert on public.native_sync_mutations;
create policy native_sync_mutations_owner_insert on public.native_sync_mutations for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists native_sync_mutations_owner_update on public.native_sync_mutations;
create policy native_sync_mutations_owner_update on public.native_sync_mutations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists native_sync_mutations_owner_delete on public.native_sync_mutations;
create policy native_sync_mutations_owner_delete on public.native_sync_mutations for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.native_sync_mutations from anon;
grant select, insert, update, delete on public.native_sync_mutations to authenticated;

commit;
