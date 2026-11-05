begin;
alter table public.software_library add column if not exists alternate_name text not null default '';
alter table public.software_library add column if not exists ios_regions jsonb not null default '[]'::jsonb;
alter table public.software_library add constraint software_library_alternate_name_length check(char_length(alternate_name)<=80);
alter table public.software_library add constraint software_library_ios_regions check(
 jsonb_typeof(ios_regions)='array' and jsonb_array_length(ios_regions)<=2 and ios_regions <@ '["CN","US"]'::jsonb
 and (ios_regions='[]'::jsonb or platforms @> '["iOS"]'::jsonb)
 and (jsonb_array_length(ios_regions)<2 or ios_regions->0<>ios_regions->1)
);
-- Existing names, acquisitions and costs are unchanged; unknown store regions stay empty.
commit;
