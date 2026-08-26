begin;

alter table public.trackers
  add column if not exists icon_type text not null default 'default',
  add column if not exists icon_value text not null default '',
  add column if not exists stats_config jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.trackers add constraint trackers_icon_type_check check (icon_type in ('default','image'));
exception when duplicate_object then null; end $$;

-- EvaOrbit Trackers deliberately record moments, not timers. Keep the old
-- column for backward compatibility while normalizing existing rows.
update public.trackers set time_type='point' where time_type<>'point';

alter table public.tracker_fields
  add column if not exists field_key text,
  add column if not exists unit text not null default '',
  add column if not exists precision integer not null default 0,
  add column if not exists config_json jsonb not null default '{}'::jsonb,
  add column if not exists archived_at timestamptz;

update public.tracker_fields set field_key='field_' || id::text where field_key is null or field_key='';
alter table public.tracker_fields alter column field_key set not null;

do $$ begin
  alter table public.tracker_fields add constraint tracker_fields_precision_check check (precision between 0 and 6);
exception when duplicate_object then null; end $$;

create unique index if not exists idx_tracker_fields_stable_key on public.tracker_fields(user_id, tracker_id, field_key);
create index if not exists idx_tracker_fields_active on public.tracker_fields(user_id, tracker_id, archived_at, sort_order);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracker-icons', 'tracker-icons', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists evaorbit_tracker_icons_owner_select on storage.objects;
drop policy if exists evaorbit_tracker_icons_owner_insert on storage.objects;
drop policy if exists evaorbit_tracker_icons_owner_update on storage.objects;
drop policy if exists evaorbit_tracker_icons_owner_delete on storage.objects;

create policy evaorbit_tracker_icons_owner_select on storage.objects for select to authenticated
  using (bucket_id='tracker-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_tracker_icons_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id='tracker-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_tracker_icons_owner_update on storage.objects for update to authenticated
  using (bucket_id='tracker-icons' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='tracker-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_tracker_icons_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='tracker-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
