begin;
alter table public.food_dishes add column if not exists drink_type text check (drink_type in ('coffee','milk_tea','tea','soda','juice','alcohol','other'));
alter table public.food_library add column if not exists drink_type text check (drink_type in ('coffee','milk_tea','tea','soda','juice','alcohol','other'));
-- Only transfer unanimous existing classifications; never guess from names or overwrite logs.
update public.food_dishes d set drink_type = (
  select min(l.drink_type) from public.drink_logs l
  where l.drink_menu_id=d.id and l.user_id=d.user_id and l.drink_type not in ('other','water')
  having count(distinct l.drink_type)=1
) where d.kind='drink' and d.drink_type is null;
update public.food_library f set drink_type = (
  select min(l.drink_type) from public.drink_logs l
  where l.food_library_id=f.id and l.user_id=f.user_id and l.drink_type not in ('other','water')
  having count(distinct l.drink_type)=1
) where f.category='drink' and f.drink_type is null;
commit;
