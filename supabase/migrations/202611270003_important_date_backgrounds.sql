alter table public.important_dates
  add column count_mode text not null default 'elapsed' check(count_mode in ('elapsed','ordinal')),
  add column background jsonb not null default '{"kind":"none"}',
  add column background_image text,
  add column background_image_version text;

create function public.normalize_important_date_background() returns trigger language plpgsql set search_path=public as $$
declare kind text:=new.background->>'kind';
begin
  if jsonb_typeof(new.background) is distinct from 'object' or kind is null or kind not in ('none','solid','gradient','photo') then raise exception 'Invalid date background' using errcode='23514';end if;
  if (new.background - case kind when 'none' then array['kind'] when 'solid' then array['kind','color'] when 'gradient' then array['kind','color','secondary'] else array['kind','x','y','shade','zoom'] end) <> '{}'::jsonb then raise exception 'Unknown background setting' using errcode='23514';end if;
  if kind in ('solid','gradient') and coalesce(new.background->>'color','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Invalid background color' using errcode='23514';end if;
  if kind='gradient' and coalesce(new.background->>'secondary','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Invalid gradient color' using errcode='23514';end if;
  if kind='photo' then
    if new.background_image is null or length(new.background_image)>180000 or new.background_image!~'^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' then raise exception 'Choose a valid background photo' using errcode='23514';end if;
    if jsonb_typeof(new.background->'x') is distinct from 'number' or jsonb_typeof(new.background->'y') is distinct from 'number' or jsonb_typeof(new.background->'shade') is distinct from 'number' then raise exception 'Invalid photo positioning' using errcode='23514';end if;
    if new.background ? 'zoom' and (jsonb_typeof(new.background->'zoom') is distinct from 'number' or (new.background->>'zoom')::numeric not between 1 and 3) then raise exception 'Invalid photo zoom' using errcode='23514';end if;
    if (new.background->>'x')::numeric not between 0 and 100 or (new.background->>'y')::numeric not between 0 and 100 or (new.background->>'shade')::numeric not between 0 and 1 then raise exception 'Invalid photo positioning' using errcode='23514';end if;
    if octet_length(decode(split_part(new.background_image,',',2),'base64'))>131072 then raise exception 'Background photo too large' using errcode='23514';end if;
    new.background_image_version:=md5(new.background_image);
  else new.background_image:=null;new.background_image_version:=null;end if;
  return new;
end $$;
create trigger important_date_background before insert or update on public.important_dates for each row execute function public.normalize_important_date_background();

create function public.save_important_date_category(p_name text,p_color text) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  insert into public.important_date_categories(name,color) values(btrim(p_name),p_color) on conflict(user_id,name) do update set color=excluded.color,updated_at=now();
  return jsonb_build_object('name',btrim(p_name),'color',p_color);
end $$;
revoke all on function public.save_important_date_category(text,text) from public,anon;
grant execute on function public.save_important_date_category(text,text) to authenticated;

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
    insert into public.important_dates(title,date,recurrence,category,note,pinned,archived,reminder_time,reminder_days_before,calendar_type,lunar_date,lunar_leap_policy,background,background_image,count_mode)
      values(p_input->>'title',(p_input->>'date')::date,p_input->>'recurrence',category_name,p_input->>'note',
        (p_input->>'pinned')::boolean,(p_input->>'archived')::boolean,p_input->>'reminder_time',(p_input->>'reminder_days_before')::integer,coalesce(p_input->>'calendar_type','solar'),nullif(p_input->'lunar_date','null'::jsonb),coalesce(p_input->>'lunar_leap_policy','regular'),coalesce(p_input->'background','{"kind":"none"}'::jsonb),p_input->>'background_image',coalesce(p_input->>'count_mode','elapsed'))
      returning * into saved;
  else
    update public.important_dates set title=p_input->>'title',date=(p_input->>'date')::date,recurrence=p_input->>'recurrence',
      category=category_name,note=p_input->>'note',pinned=(p_input->>'pinned')::boolean,archived=(p_input->>'archived')::boolean,
      reminder_time=p_input->>'reminder_time',reminder_days_before=(p_input->>'reminder_days_before')::integer,updated_at=now(),calendar_type=coalesce(p_input->>'calendar_type',existing.calendar_type),
      lunar_date=case when p_input ? 'calendar_type' then nullif(p_input->'lunar_date','null'::jsonb) else existing.lunar_date end,
      lunar_leap_policy=coalesce(p_input->>'lunar_leap_policy',existing.lunar_leap_policy),
      count_mode=coalesce(p_input->>'count_mode',existing.count_mode),
      background=coalesce(p_input->'background',existing.background),
      background_image=case when p_input ? 'background_image' then p_input->>'background_image' else existing.background_image end
      where id=p_id and user_id=auth.uid() returning * into saved;
    if not found then raise exception 'Important date not found' using errcode='P0002'; end if;
  end if;
  return (to_jsonb(saved)-'background_image')||jsonb_build_object('category_color',(select color from public.important_date_categories where user_id=auth.uid() and name=category_name));
end $$;
