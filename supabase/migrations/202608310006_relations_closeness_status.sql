begin;

alter table public.relation_people
  add column if not exists closeness_rank smallint,
  add column if not exists relationship_status text not null default 'active';

do $$ begin
  alter table public.relation_people add constraint relation_people_closeness_rank_check
    check (closeness_rank is null or closeness_rank between 1 and 5);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.relation_people add constraint relation_people_relationship_status_check
    check (relationship_status in ('active', 'ended'));
exception when duplicate_object then null; end $$;

create index if not exists relation_people_status_closeness
  on public.relation_people(user_id, archived_at, relationship_status, closeness_rank desc, name);

commit;
