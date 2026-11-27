alter table public.important_dates drop constraint important_dates_recurrence_check;
alter table public.important_dates add constraint important_dates_recurrence_check check(recurrence in ('none','weekly','monthly','yearly'));
alter table public.important_dates add column display_mode text not null default 'auto' check(display_mode in ('auto','elapsed','countdown'));
alter table public.important_dates add constraint important_dates_recurring_lead_check check(reminder_time is null or reminder_days_before<=case recurrence when 'weekly' then 6 when 'monthly' then 27 else 366 end);
create or replace function public.important_date_next_occurrence(p_date date,p_recurrence text,p_calendar text,p_lunar jsonb,p_policy text,p_today date)
returns date language plpgsql immutable set search_path=public as $$
declare yr integer; candidate date; leap boolean; has_leap boolean; m integer; d integer; step integer; leap_index integer; anchor date;
begin
  if p_recurrence='none' or p_date>=p_today then return p_date; end if;
  if p_recurrence='weekly' then
    candidate:=p_date+(ceil((p_today-p_date)::numeric/7)*7)::integer;
    return case when candidate<='9999-12-31'::date then candidate else null end;
  end if;
  if p_recurrence='monthly' then
    d:=case when p_calendar='lunar' then (p_lunar->>'day')::integer else extract(day from p_date)::integer end;
    if p_calendar='lunar' then
      for yr in greatest(1901,extract(year from p_today)::integer-1)..least(2100,extract(year from p_today)::integer+1) loop
        for m in 1..12 loop
          for leap_index in 0..1 loop
            candidate:=public.important_date_lunar_solar(yr,m,d,leap_index=1,true);
            if candidate>=p_today and candidate>=p_date then return candidate;end if;
          end loop;
        end loop;
      end loop;
      return null;
    end if;
    for step in 0..1 loop
      anchor:=(date_trunc('month',p_today)+make_interval(months=>step))::date;
      if extract(year from anchor)>9999 then return null;end if;
      candidate:=anchor+least(d,extract(day from(anchor+interval '1 month - 1 day'))::integer)-1;
      if candidate>=p_today then return candidate;end if;
    end loop;
    return null;
  end if;
  if p_calendar='lunar' then
    m:=(p_lunar->>'month')::integer;d:=(p_lunar->>'day')::integer;leap:=(p_lunar->>'leap')::boolean;
    for yr in greatest((p_lunar->>'year')::integer,extract(year from p_today)::integer-1)..2100 loop
      has_leap:=public.important_date_lunar_solar(yr,m,1,true) is not null;
      if leap and not has_leap and p_policy='skip' then continue; end if;
      candidate:=public.important_date_lunar_solar(yr,m,d,leap and has_leap,true);
      if candidate>=p_today then return candidate; end if;
    end loop;
    return null;
  end if;
  yr:=extract(year from p_today)::integer;m:=extract(month from p_date)::integer;d:=extract(day from p_date)::integer;
  candidate:=make_date(yr,m,1)+least(d,extract(day from(make_date(yr,m,1)+interval '1 month - 1 day'))::integer)-1;
  if candidate>=p_today then return candidate; end if;
  if yr=9999 then return null; end if;
  yr:=yr+1;return make_date(yr,m,1)+least(d,extract(day from(make_date(yr,m,1)+interval '1 month - 1 day'))::integer)-1;
end $$;

create or replace function public.save_important_date(p_id bigint,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare saved public.important_dates; existing public.important_dates; category_name text:=btrim(coalesce(p_input->>'category',''));
begin
  if p_id is not null then
    select * into existing from public.important_dates where id=p_id and user_id=auth.uid();
    if not found then raise exception 'Important date not found' using errcode='P0002';end if;
  end if;
  if category_name<>'' and p_input ? 'category_color' then
    insert into public.important_date_categories(name,color) values(category_name,p_input->>'category_color')
      on conflict(user_id,name) do update set color=excluded.color,updated_at=now();
  end if;
  if p_id is null then
    insert into public.important_dates(title,date,recurrence,category,note,pinned,archived,reminder_time,reminder_days_before,calendar_type,lunar_date,lunar_leap_policy,background,background_image,count_mode,display_mode)
      values(p_input->>'title',(p_input->>'date')::date,p_input->>'recurrence',category_name,p_input->>'note',
        (p_input->>'pinned')::boolean,(p_input->>'archived')::boolean,p_input->>'reminder_time',(p_input->>'reminder_days_before')::integer,coalesce(p_input->>'calendar_type','solar'),nullif(p_input->'lunar_date','null'::jsonb),coalesce(p_input->>'lunar_leap_policy','regular'),coalesce(p_input->'background','{"kind":"none"}'::jsonb),p_input->>'background_image',coalesce(p_input->>'count_mode','elapsed'),coalesce(p_input->>'display_mode','auto'))
      returning * into saved;
  else
    update public.important_dates set title=p_input->>'title',date=(p_input->>'date')::date,recurrence=p_input->>'recurrence',
      category=category_name,note=p_input->>'note',pinned=(p_input->>'pinned')::boolean,archived=(p_input->>'archived')::boolean,
      reminder_time=p_input->>'reminder_time',reminder_days_before=(p_input->>'reminder_days_before')::integer,updated_at=now(),calendar_type=coalesce(p_input->>'calendar_type',existing.calendar_type),
      lunar_date=case when p_input ? 'calendar_type' then nullif(p_input->'lunar_date','null'::jsonb) else existing.lunar_date end,
      lunar_leap_policy=coalesce(p_input->>'lunar_leap_policy',existing.lunar_leap_policy),
      display_mode=coalesce(p_input->>'display_mode',existing.display_mode),
      count_mode=coalesce(p_input->>'count_mode',existing.count_mode),
      background=coalesce(p_input->'background',existing.background),
      background_image=case when p_input ? 'background_image' then p_input->>'background_image' else existing.background_image end
      where id=p_id and user_id=auth.uid() returning * into saved;
    if not found then raise exception 'Important date not found' using errcode='P0002'; end if;
  end if;
  return (to_jsonb(saved)-'background_image')||jsonb_build_object('category_color',(select color from public.important_date_categories where user_id=auth.uid() and name=category_name));
end $$;
create function public.enforce_important_date_photo_budget() returns trigger language plpgsql set search_path=public as $$
begin
  if (TG_OP='INSERT' or new.background_image is distinct from old.background_image) and new.background_image is not null
    and octet_length(decode(split_part(new.background_image,',',2),'base64'))>=100000 then raise exception 'New background photo must be smaller than 100 KB' using errcode='23514';end if;
  return new;
end $$;
create trigger important_date_photo_budget before insert or update on public.important_dates for each row execute function public.enforce_important_date_photo_budget();
create or replace function public.refresh_important_date_reminders() returns void language sql security invoker set search_path=public as $$
  update public.important_dates set updated_at=updated_at where recurrence in ('weekly','monthly','yearly') and not archived and reminder_time is not null;
$$;
