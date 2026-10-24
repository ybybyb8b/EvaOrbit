begin;
alter table public.software_library add column if not exists icon_path text not null default '';
commit;
