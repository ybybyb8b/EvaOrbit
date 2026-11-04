begin;

alter table public.project_items drop constraint if exists project_items_status_check;
alter table public.project_items add constraint project_items_status_check
  check (status in ('idea','to_solve','doing','blocked','done','verified','dropped'));

commit;
