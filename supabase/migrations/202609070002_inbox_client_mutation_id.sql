alter table public.inbox_items
  add column if not exists client_mutation_id uuid,
  add column if not exists last_client_mutation_id uuid;

create unique index if not exists inbox_items_user_client_mutation_id_key
  on public.inbox_items(user_id, client_mutation_id);
