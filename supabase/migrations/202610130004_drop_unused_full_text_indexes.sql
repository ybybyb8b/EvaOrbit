begin;

-- Current Food and legacy Memory searches use ILIKE, not to_tsvector queries.
-- Keep search_text and all records; remove only the unused expression indexes.
drop index if exists public.idx_food_logs_search;
drop index if exists public.idx_memories_search_text;

commit;
