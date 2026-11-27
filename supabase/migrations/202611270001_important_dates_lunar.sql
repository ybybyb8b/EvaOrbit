-- Chinese lunar years 1901–2100; lunar-javascript 1.7.8 boundaries shared with lunar-calendar-data.ts.
alter table public.important_dates
  add column calendar_type text not null default 'solar' check(calendar_type in ('solar','lunar')),
  add column lunar_date jsonb,
  add column lunar_leap_policy text not null default 'regular' check(lunar_leap_policy in ('regular','skip'));

create function public.important_date_lunar_solar(p_year integer,p_month integer,p_day integer,p_leap boolean,p_clamp boolean default false)
returns date language plpgsql immutable strict set search_path=public as $$
declare starts date; leap_month integer; bits integer; month_days integer; offset_days integer:=0; bit_index integer:=0; m integer; leap_index integer;
begin
  select y.starts,y.leap_month,y.bits into starts,leap_month,bits from (values
(1901,date '1901-02-19',0,1874),
(1902,date '1902-02-08',0,3749),
(1903,date '1903-01-29',5,5706),
(1904,date '1904-02-16',0,1611),
(1905,date '1905-02-04',0,2715),
(1906,date '1906-01-25',4,5462),
(1907,date '1907-02-13',0,1386),
(1908,date '1908-02-02',0,2905),
(1909,date '1909-01-22',2,5970),
(1910,date '1910-02-10',0,1874),
(1911,date '1911-01-30',6,6949),
(1912,date '1912-02-18',0,2853),
(1913,date '1913-02-06',0,2635),
(1914,date '1914-01-26',5,5291),
(1915,date '1915-02-14',0,685),
(1916,date '1916-02-03',0,1387),
(1917,date '1917-01-23',2,2921),
(1918,date '1918-02-11',0,3497),
(1919,date '1919-02-01',7,7570),
(1920,date '1920-02-20',0,3730),
(1921,date '1921-02-08',0,3365),
(1922,date '1922-01-28',5,6733),
(1923,date '1923-02-16',0,2646),
(1924,date '1924-02-05',0,694),
(1925,date '1925-01-24',4,5557),
(1926,date '1926-02-13',0,1748),
(1927,date '1927-02-02',0,3753),
(1928,date '1928-01-23',2,7826),
(1929,date '1929-02-10',0,3730),
(1930,date '1930-01-30',6,3366),
(1931,date '1931-02-17',0,1323),
(1932,date '1932-02-06',0,2647),
(1933,date '1933-01-26',5,4790),
(1934,date '1934-02-14',0,2906),
(1935,date '1935-02-04',0,1748),
(1936,date '1936-01-24',3,3785),
(1937,date '1937-02-11',0,1865),
(1938,date '1938-01-31',7,5779),
(1939,date '1939-02-19',0,2707),
(1940,date '1940-02-08',0,1323),
(1941,date '1941-01-27',6,2651),
(1942,date '1942-02-15',0,2733),
(1943,date '1943-02-05',0,1386),
(1944,date '1944-01-25',4,6997),
(1945,date '1945-02-13',0,2980),
(1946,date '1946-02-02',0,2889),
(1947,date '1947-01-22',2,6803),
(1948,date '1948-02-10',0,2709),
(1949,date '1949-01-29',7,5421),
(1950,date '1950-02-17',0,1334),
(1951,date '1951-02-06',0,2733),
(1952,date '1952-01-27',5,5546),
(1953,date '1953-02-14',0,1458),
(1954,date '1954-02-03',0,3493),
(1955,date '1955-01-24',3,7498),
(1956,date '1956-02-12',0,3402),
(1957,date '1957-01-31',8,2709),
(1958,date '1958-02-18',0,2711),
(1959,date '1959-02-08',0,1366),
(1960,date '1960-01-28',6,2741),
(1961,date '1961-02-15',0,2773),
(1962,date '1962-02-05',0,1746),
(1963,date '1963-01-25',4,3749),
(1964,date '1964-02-13',0,3749),
(1965,date '1965-02-02',0,1610),
(1966,date '1966-01-21',3,3223),
(1967,date '1967-02-09',0,2715),
(1968,date '1968-01-30',7,5466),
(1969,date '1969-02-17',0,1386),
(1970,date '1970-02-06',0,2921),
(1971,date '1971-01-27',5,5970),
(1972,date '1972-02-15',0,2898),
(1973,date '1973-02-03',0,2853),
(1974,date '1974-01-23',4,5707),
(1975,date '1975-02-11',0,2635),
(1976,date '1976-01-31',8,5291),
(1977,date '1977-02-18',0,685),
(1978,date '1978-02-07',0,1389),
(1979,date '1979-01-28',6,2921),
(1980,date '1980-02-16',0,3497),
(1981,date '1981-02-05',0,3474),
(1982,date '1982-01-25',4,7461),
(1983,date '1983-02-13',0,3365),
(1984,date '1984-02-02',10,6733),
(1985,date '1985-02-20',0,2646),
(1986,date '1986-02-09',0,694),
(1987,date '1987-01-29',6,1461),
(1988,date '1988-02-17',0,1749),
(1989,date '1989-02-06',0,3753),
(1990,date '1990-01-27',5,7826),
(1991,date '1991-02-15',0,3730),
(1992,date '1992-02-04',0,3366),
(1993,date '1993-01-23',3,2646),
(1994,date '1994-02-10',0,2647),
(1995,date '1995-01-31',8,5334),
(1996,date '1996-02-19',0,858),
(1997,date '1997-02-07',0,1749),
(1998,date '1998-01-28',5,5833),
(1999,date '1999-02-16',0,1865),
(2000,date '2000-02-05',0,1683),
(2001,date '2001-01-24',4,5419),
(2002,date '2002-02-12',0,1323),
(2003,date '2003-02-01',0,2651),
(2004,date '2004-01-22',2,5466),
(2005,date '2005-02-09',0,1386),
(2006,date '2006-01-29',7,6997),
(2007,date '2007-02-18',0,2980),
(2008,date '2008-02-07',0,2889),
(2009,date '2009-01-26',5,6803),
(2010,date '2010-02-14',0,2709),
(2011,date '2011-02-03',0,1325),
(2012,date '2012-01-23',4,2733),
(2013,date '2013-02-10',0,2741),
(2014,date '2014-01-31',9,5546),
(2015,date '2015-02-19',0,1490),
(2016,date '2016-02-08',0,3493),
(2017,date '2017-01-28',6,7498),
(2018,date '2018-02-16',0,3402),
(2019,date '2019-02-05',0,3221),
(2020,date '2020-01-25',4,5422),
(2021,date '2021-02-12',0,1366),
(2022,date '2022-02-01',0,2741),
(2023,date '2023-01-22',2,5554),
(2024,date '2024-02-10',0,1746),
(2025,date '2025-01-29',6,3749),
(2026,date '2026-02-17',0,1829),
(2027,date '2027-02-06',0,1611),
(2028,date '2028-01-26',5,3223),
(2029,date '2029-02-13',0,3243),
(2030,date '2030-02-03',0,1370),
(2031,date '2031-01-23',3,2774),
(2032,date '2032-02-11',0,2921),
(2033,date '2033-01-31',11,5970),
(2034,date '2034-02-19',0,2898),
(2035,date '2035-02-08',0,2853),
(2036,date '2036-01-28',6,6731),
(2037,date '2037-02-15',0,2635),
(2038,date '2038-02-04',0,1195),
(2039,date '2039-01-24',5,1371),
(2040,date '2040-02-12',0,1453),
(2041,date '2041-02-01',0,2922),
(2042,date '2042-01-22',2,6994),
(2043,date '2043-02-10',0,3474),
(2044,date '2044-01-30',7,7461),
(2045,date '2045-02-17',0,3365),
(2046,date '2046-02-06',0,2645),
(2047,date '2047-01-26',5,5293),
(2048,date '2048-02-14',0,1206),
(2049,date '2049-02-02',0,1461),
(2050,date '2050-01-23',3,3498),
(2051,date '2051-02-11',0,3785),
(2052,date '2052-02-01',8,7826),
(2053,date '2053-02-19',0,3730),
(2054,date '2054-02-08',0,3366),
(2055,date '2055-01-28',6,2646),
(2056,date '2056-02-15',0,2647),
(2057,date '2057-02-04',0,1238),
(2058,date '2058-01-24',4,1749),
(2059,date '2059-02-12',0,1877),
(2060,date '2060-02-02',0,1865),
(2061,date '2061-01-21',3,3731),
(2062,date '2062-02-09',0,1683),
(2063,date '2063-01-29',7,5419),
(2064,date '2064-02-17',0,1323),
(2065,date '2065-02-05',0,2651),
(2066,date '2066-01-26',5,5466),
(2067,date '2067-02-14',0,1386),
(2068,date '2068-02-03',0,2917),
(2069,date '2069-01-23',4,5962),
(2070,date '2070-02-11',0,2890),
(2071,date '2071-01-31',8,6805),
(2072,date '2072-02-19',0,2709),
(2073,date '2073-02-07',0,1325),
(2074,date '2074-01-27',6,2733),
(2075,date '2075-02-15',0,2741),
(2076,date '2076-02-05',0,1450),
(2077,date '2077-01-24',4,2981),
(2078,date '2078-02-12',0,3493),
(2079,date '2079-02-02',0,3402),
(2080,date '2080-01-22',3,7317),
(2081,date '2081-02-09',0,3222),
(2082,date '2082-01-29',7,6478),
(2083,date '2083-02-17',0,1366),
(2084,date '2084-02-06',0,2741),
(2085,date '2085-01-26',5,5554),
(2086,date '2086-02-14',0,1746),
(2087,date '2087-02-03',0,3749),
(2088,date '2088-01-24',4,3658),
(2089,date '2089-02-10',0,1675),
(2090,date '2090-01-30',8,3223),
(2091,date '2091-02-18',0,1195),
(2092,date '2092-02-07',0,1371),
(2093,date '2093-01-27',6,2774),
(2094,date '2094-02-15',0,2922),
(2095,date '2095-02-05',0,1874),
(2096,date '2096-01-25',4,5925),
(2097,date '2097-02-12',0,2885),
(2098,date '2098-02-01',0,2699),
(2099,date '2099-01-21',2,5275),
(2100,date '2100-02-09',0,1195)
  ) as y(year,starts,leap_month,bits) where y.year=p_year;
  if not found or p_month not between 1 and 12 or p_day not between 1 and 30 then return null; end if;
  for m in 1..12 loop
    for leap_index in 0..case when m=leap_month then 1 else 0 end loop
      month_days:=29+((bits>>bit_index)&1);
      if m=p_month and (leap_index=1)=p_leap then
        if not p_clamp and p_day>month_days then return null; end if;
        return starts+offset_days+least(p_day,month_days)-1;
      end if;
      offset_days:=offset_days+month_days;bit_index:=bit_index+1;
    end loop;
  end loop;
  return null;
end $$;

create function public.important_date_next_occurrence(p_date date,p_recurrence text,p_calendar text,p_lunar jsonb,p_policy text,p_today date)
returns date language plpgsql immutable set search_path=public as $$
declare yr integer; candidate date; leap boolean; has_leap boolean; m integer; d integer;
begin
  if p_recurrence='none' or p_date>=p_today then return p_date; end if;
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

create function public.normalize_important_date_calendar() returns trigger language plpgsql set search_path=public as $$
declare expected date;
begin
  if new.calendar_type='solar' then new.lunar_date:=null;new.lunar_leap_policy:='regular';return new; end if;
  if jsonb_typeof(new.lunar_date) is distinct from 'object' then raise exception 'Invalid lunar date' using errcode='23514';end if;
  if (select count(*) from jsonb_object_keys(new.lunar_date))<>4
    or not(new.lunar_date ?& array['year','month','day','leap'])
    or jsonb_typeof(new.lunar_date->'leap') is distinct from 'boolean'
    or exists(select 1 from unnest(array['year','month','day']) k where jsonb_typeof(new.lunar_date->k) is distinct from 'number' or (new.lunar_date->>k)!~'^[0-9]+$')
    then raise exception 'Invalid lunar date' using errcode='23514';end if;
  expected:=public.important_date_lunar_solar((new.lunar_date->>'year')::integer,(new.lunar_date->>'month')::integer,(new.lunar_date->>'day')::integer,(new.lunar_date->>'leap')::boolean);
  if expected is null or new.date<>expected then raise exception 'Invalid or inconsistent lunar date' using errcode='23514';end if;
  return new;
end $$;
create trigger important_date_calendar before insert or update on public.important_dates for each row execute function public.normalize_important_date_calendar();

create or replace function public.sync_important_date_reminder() returns trigger language plpgsql security definer set search_path=public as $$
declare
  occurrence date; today date := (now() at time zone 'Asia/Shanghai')::date;
  scheduled timestamptz; existing public.reminders;
begin
  if TG_OP='DELETE' then
    update public.reminders set is_active=false,status='cancelled',next_due_at=null,snoozed_until=null,cancelled_at=now()
      where user_id=old.user_id and source_type='important_date' and source_id=old.id;
    return old;
  end if;
  if TG_OP='UPDATE' and new.user_id<>old.user_id then raise exception 'Cannot change important date owner'; end if;
  occurrence:=public.important_date_next_occurrence(new.date,new.recurrence,new.calendar_type,new.lunar_date,new.lunar_leap_policy,today);
  select * into existing from public.reminders where user_id=new.user_id and source_type='important_date' and source_id=new.id for update;
  if new.archived or new.reminder_time is null or occurrence is null or occurrence<today then
    if existing.id is not null then
      update public.reminders set is_active=false,status='cancelled',next_due_at=null,snoozed_until=null,cancelled_at=now() where id=existing.id;
    end if;
    return new;
  end if;
  scheduled:=((occurrence-new.reminder_days_before)+new.reminder_time::time) at time zone 'Asia/Shanghai';
  if existing.id is null then
    -- Do not send a newly configured reminder whose selected alert time has already passed.
    if scheduled<now() then return new; end if;
    insert into public.reminders(user_id,title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,due_has_explicit_time,timezone,note,lead_time_minutes,repeat_while_overdue,status,is_active)
      values(new.user_id,new.title,'important_date',new.id,'important_date',new.id,'one_time',scheduled,scheduled,true,'Asia/Shanghai',occurrence::text,0,false,'scheduled',true);
  elsif existing.next_due_at is distinct from scheduled or not existing.is_active then
    update public.reminders set title=new.title,starts_at=scheduled,next_due_at=case when scheduled>=now() then scheduled else null end,
      is_active=scheduled>=now(),status=case when scheduled>=now() then 'scheduled' else 'cancelled' end,note=occurrence::text,
      sent_at=null,last_notified_at=null,snoozed_until=null,cancelled_at=null,updated_at=now() where id=existing.id;
  else
    update public.reminders set title=new.title,note=occurrence::text where id=existing.id;
  end if;
  return new;
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
    insert into public.important_dates(title,date,recurrence,category,note,pinned,archived,reminder_time,reminder_days_before,calendar_type,lunar_date,lunar_leap_policy)
      values(p_input->>'title',(p_input->>'date')::date,p_input->>'recurrence',category_name,p_input->>'note',
        (p_input->>'pinned')::boolean,(p_input->>'archived')::boolean,p_input->>'reminder_time',(p_input->>'reminder_days_before')::integer,coalesce(p_input->>'calendar_type','solar'),nullif(p_input->'lunar_date','null'::jsonb),coalesce(p_input->>'lunar_leap_policy','regular'))
      returning * into saved;
  else
    update public.important_dates set title=p_input->>'title',date=(p_input->>'date')::date,recurrence=p_input->>'recurrence',
      category=category_name,note=p_input->>'note',pinned=(p_input->>'pinned')::boolean,archived=(p_input->>'archived')::boolean,
      reminder_time=p_input->>'reminder_time',reminder_days_before=(p_input->>'reminder_days_before')::integer,updated_at=now(),calendar_type=coalesce(p_input->>'calendar_type',existing.calendar_type),
      lunar_date=case when p_input ? 'calendar_type' then nullif(p_input->'lunar_date','null'::jsonb) else existing.lunar_date end,
      lunar_leap_policy=coalesce(p_input->>'lunar_leap_policy',existing.lunar_leap_policy)
      where id=p_id and user_id=auth.uid() returning * into saved;
    if not found then raise exception 'Important date not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved)||jsonb_build_object('category_color',(select color from public.important_date_categories where user_id=auth.uid() and name=category_name));
end $$;
