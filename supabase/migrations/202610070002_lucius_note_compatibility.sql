-- Keep an empty compatibility column for clients running the previous release.
-- Retired note data stays deleted, and no client can save new note content.
alter table public.lucius_state add column if not exists current_note text not null default '';
alter table public.lucius_state add constraint lucius_state_retired_note_empty check (current_note = '');
revoke update (current_note) on public.lucius_state from authenticated;
