begin;

create function public.eo_hermes_rename_conversation(p_conversation_id uuid, p_title text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  next_title text := regexp_replace(p_title, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  renamed public.hermes_conversations;
begin
  if uid is null then raise exception 'HERMES_AUTH'; end if;
  if coalesce(char_length(next_title), 0) not between 1 and 80 then raise exception 'HERMES_INPUT'; end if;
  update public.hermes_conversations set title=next_title
    where id=p_conversation_id and user_id=uid
    returning * into renamed;
  if not found then raise exception 'HERMES_NOT_FOUND'; end if;
  return jsonb_build_object('id', renamed.id, 'title', renamed.title);
end $$;

revoke all on function public.eo_hermes_rename_conversation(uuid,text) from public,anon;
grant execute on function public.eo_hermes_rename_conversation(uuid,text) to authenticated;
commit;
