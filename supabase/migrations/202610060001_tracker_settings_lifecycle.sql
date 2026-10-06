begin;
alter table public.trackers add column if not exists archived_at timestamptz;

-- One transaction removes the property and its historical values; RLS remains active.
create or replace function public.delete_tracker_field_permanently(p_field_id bigint)
returns boolean language plpgsql security invoker set search_path = public as $$
declare property public.tracker_fields%rowtype;
begin
  select * into property from public.tracker_fields where id = p_field_id and user_id = auth.uid() for update;
  if not found then return false; end if;
  update public.tracker_entries
    set values_json = values_json - coalesce(property.field_key::text, 'field_' || property.id::text) - property.id::text - ('field_' || property.id::text), updated_at = now()
    where tracker_id = property.tracker_id and user_id = auth.uid();
  delete from public.tracker_fields where id = property.id and user_id = auth.uid();
  return true;
end $$;
revoke all on function public.delete_tracker_field_permanently(bigint) from public, anon;
grant execute on function public.delete_tracker_field_permanently(bigint) to authenticated;
commit;
