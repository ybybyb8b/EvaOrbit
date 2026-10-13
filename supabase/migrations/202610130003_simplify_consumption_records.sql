begin;

-- Consolidate text before dropping retired inputs. No quantities are inferred.
update public.food_logs set description = concat_ws(E'\n\n',
  nullif(btrim(description), ''),
  case when btrim(portion) <> '' and btrim(portion) <> btrim(description) then '份量说明：' || btrim(portion) end,
  case when btrim(notes) <> '' and btrim(notes) <> btrim(description) and btrim(notes) <> btrim(portion) then btrim(notes) end
);
update public.drink_logs set notes = concat_ws(E'\n\n',
  nullif(btrim(notes), ''),
  case when btrim(brand) <> '' then '品牌：' || btrim(brand) end,
  case when volume_ml is not null then '原记录容量：' || volume_ml || ' ml' end,
  case when caffeine_mg is not null then '原记录咖啡因：' || caffeine_mg || ' mg' end
);

alter table public.food_logs drop column portion, drop column notes, drop column calendar_time_enabled;
alter table public.drink_logs drop column brand, drop column volume_ml, drop column caffeine_mg;

commit;
