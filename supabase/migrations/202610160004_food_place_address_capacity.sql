begin;
-- A legacy area (200 chars) plus a full address (500 chars) must remain editable
-- without truncation. Services merge them on read and canonicalize on next save.
-- Keep the legacy column/index intact; no bulk identity rewrites or record relinks.
alter table public.food_places drop constraint if exists food_places_address_check;
alter table public.food_places add constraint food_places_address_check check(length(address)<=1000);
commit;
