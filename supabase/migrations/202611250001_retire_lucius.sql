begin;

-- Apply only after the SQL archive has been restored and checked, and the
-- compatible Web/API has been deployed. The retirement runner sets this guard.
do $$
begin
  if coalesce(current_setting('evaorbit.lucius_backup_sha256', true), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Lucius retirement requires a verified backup; see docs/LUCIUS_RETIREMENT.md';
  end if;
end;
$$;

delete from public.migration_import_ledger where resource in ('lucius_diary', 'lucius_case');
alter table public.migration_import_ledger drop constraint migration_import_ledger_resource_check;
alter table public.migration_import_ledger add constraint migration_import_ledger_resource_check
  check (resource in ('memo', 'chronicle'));

update public.ui_preferences set home_module_order = home_module_order - 'lucius'
where home_module_order ? 'lucius';

update public.agent_connections c
set policy = jsonb_set(c.policy, '{permissions}', coalesce((
  select jsonb_agg(permission order by ordinal)
  from jsonb_array_elements(c.policy->'permissions') with ordinality p(permission, ordinal)
  where permission #>> '{}' !~ '^lucius_(state|diary|post|post_comment|case):'
), '[]'::jsonb)), revision = c.revision + 1
where jsonb_typeof(c.policy->'permissions') = 'array'
  and exists (select 1 from jsonb_array_elements_text(c.policy->'permissions') p(permission)
    where permission ~ '^lucius_(state|diary|post|post_comment|case):');

delete from public.agent_access_history
where resource in ('lucius_state', 'lucius_diary', 'lucius_post', 'lucius_post_comment', 'lucius_case');
delete from public.notification_deliveries where source_type like 'lucius%' or target_type like 'lucius%';

-- No CASCADE: an unexpected dependency must stop the transaction.
drop table public.lucius_post_comments;
drop table public.lucius_posts;
drop table public.lucius_diary_entries;
drop table public.lucius_state;
drop table public.lucius_cases;

commit;
