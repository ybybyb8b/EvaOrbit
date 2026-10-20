begin;

-- Save first completion and metadata under the same row lock. Repeated requests
-- never create a rewatch. Invoker privileges and existing RLS retain ownership.
create or replace function public.complete_media_item(p_media_id bigint, p_patch jsonb, p_watched_date date)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_item public.media_items; next_item public.media_items;
begin
  if p_watched_date is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A completion date and metadata are required';
  end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k not in
    ('title','original_title','translated_title','media_type','status','rating','is_favorite','note','series_id','season_number','season_title')) then
    raise exception 'Unsupported Media field';
  end if;
  select * into current_item from public.media_items
    where id=p_media_id and user_id=(select auth.uid()) for update;
  if not found then return false; end if;
  if exists (select 1 from public.media_viewings where media_id=p_media_id
    and user_id=(select auth.uid()) and viewing_number=1 and watched_date<>p_watched_date) then
    raise exception 'Completion already has a different date; edit its viewing date';
  end if;
  next_item := jsonb_populate_record(current_item,p_patch || jsonb_build_object('status','completed'));
  update public.media_items set title=next_item.title, original_title=next_item.original_title,
    translated_title=next_item.translated_title, media_type=next_item.media_type,
    status='completed', rating=next_item.rating, is_favorite=next_item.is_favorite,
    note=next_item.note, series_id=next_item.series_id,
    season_number=next_item.season_number, season_title=next_item.season_title
    where id=p_media_id and user_id=(select auth.uid());
  if not exists (select 1 from public.media_viewings where media_id=p_media_id and user_id=(select auth.uid())) then
    insert into public.media_viewings(user_id,media_id,watched_date,viewing_number)
      values ((select auth.uid()),p_media_id,p_watched_date,1);
  end if;
  return true;
end;
$$;
revoke all on function public.complete_media_item(bigint,jsonb,date) from public,anon;
grant execute on function public.complete_media_item(bigint,jsonb,date) to authenticated;

commit;
