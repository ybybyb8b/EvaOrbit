alter table public.eventkit_links drop constraint if exists eventkit_links_entity_type_check;
alter table public.eventkit_links add constraint eventkit_links_entity_type_check check (entity_type in ('task','reminder','calendar_event'));
