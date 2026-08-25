begin;

alter table public.ai_settings
  add column if not exists user_display_name text not null default '我',
  add column if not exists user_avatar_type text not null default 'default',
  add column if not exists user_avatar_value text not null default '',
  add column if not exists assistant_display_name text not null default 'Eva',
  add column if not exists assistant_avatar_type text not null default 'default',
  add column if not exists assistant_avatar_value text not null default '',
  add column if not exists show_user_name boolean not null default true,
  add column if not exists show_assistant_name boolean not null default true,
  add column if not exists show_avatars boolean not null default true;

do $$ begin
  alter table public.ai_settings add constraint ai_settings_user_avatar_type_check check (user_avatar_type in ('default','emoji','image'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ai_settings add constraint ai_settings_assistant_avatar_type_check check (assistant_avatar_type in ('default','emoji','image'));
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists evaorbit_avatars_owner_select on storage.objects;
drop policy if exists evaorbit_avatars_owner_insert on storage.objects;
drop policy if exists evaorbit_avatars_owner_update on storage.objects;
drop policy if exists evaorbit_avatars_owner_delete on storage.objects;

create policy evaorbit_avatars_owner_select on storage.objects for select to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evaorbit_avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
