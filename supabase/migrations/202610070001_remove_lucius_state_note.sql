-- Remove the retired note and its data; preserve status and mood.
alter table public.lucius_state drop column if exists current_note;
