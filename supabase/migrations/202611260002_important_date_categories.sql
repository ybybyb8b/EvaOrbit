create table public.important_date_categories (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 40),
  color text check(color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now(),
  primary key(user_id,name)
);
alter table public.important_date_categories enable row level security;
create policy important_date_categories_owner on public.important_date_categories for all to authenticated
  using(user_id=auth.uid() and not (select public.evaorbit_is_external_oauth()))
  with check(user_id=auth.uid() and not (select public.evaorbit_is_external_oauth()));
grant select,insert,update,delete on public.important_date_categories to authenticated;

-- One transaction owns both the event and its shared category color.
create function public.save_important_date(p_id bigint,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare saved public.important_dates; category_name text:=btrim(coalesce(p_input->>'category',''));
begin
  if category_name<>'' and p_input ? 'category_color' then
    insert into public.important_date_categories(name,color) values(category_name,p_input->>'category_color')
      on conflict(user_id,name) do update set color=excluded.color,updated_at=now();
  end if;
  if p_id is null then
    insert into public.important_dates(title,date,recurrence,category,note,pinned,archived,reminder_time,reminder_days_before)
      values(p_input->>'title',(p_input->>'date')::date,p_input->>'recurrence',category_name,p_input->>'note',
        (p_input->>'pinned')::boolean,(p_input->>'archived')::boolean,p_input->>'reminder_time',(p_input->>'reminder_days_before')::integer)
      returning * into saved;
  else
    update public.important_dates set title=p_input->>'title',date=(p_input->>'date')::date,recurrence=p_input->>'recurrence',
      category=category_name,note=p_input->>'note',pinned=(p_input->>'pinned')::boolean,archived=(p_input->>'archived')::boolean,
      reminder_time=p_input->>'reminder_time',reminder_days_before=(p_input->>'reminder_days_before')::integer,updated_at=now()
      where id=p_id and user_id=auth.uid() returning * into saved;
    if not found then raise exception 'Important date not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved)||jsonb_build_object('category_color',(select color from public.important_date_categories where user_id=auth.uid() and name=category_name));
end $$;
revoke all on function public.save_important_date(bigint,jsonb) from public,anon;
grant execute on function public.save_important_date(bigint,jsonb) to authenticated;
