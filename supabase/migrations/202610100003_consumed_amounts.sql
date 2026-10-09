begin;
alter table public.food_logs add column if not exists consumed_weight_g numeric
  check (consumed_weight_g >= 0 and consumed_weight_g <= 1000000 and consumed_weight_g = round(consumed_weight_g, 2));
alter table public.drink_logs add column if not exists consumed_volume_ml numeric
  check (consumed_volume_ml >= 0 and consumed_volume_ml <= 10000 and consumed_volume_ml = round(consumed_volume_ml, 2));
alter table public.drink_logs add column if not exists nutrition_reference jsonb;
-- Unknown historical consumption stays NULL; capacity is not actual intake.
commit;
