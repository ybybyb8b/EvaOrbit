begin;
-- Preserve historical timestamps; their original time precision cannot be inferred.
alter table public.food_logs add column occurred_has_explicit_time boolean not null default true;
commit;
