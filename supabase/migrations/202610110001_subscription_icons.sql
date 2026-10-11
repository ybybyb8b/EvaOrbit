begin;

alter table public.subscriptions add column if not exists icon_path text not null default '';
-- Images reuse the private avatars bucket and its existing owner-folder policies.

commit;
