-- Emergency rollback to the pre-Agent access boundary. Run only together with
-- the previous app deployment. This restores legacy OAuth database access.
begin;

do $$
declare managed_policy record;
begin
  if exists (
    select 1 from pg_db_role_setting, unnest(setconfig) as setting
    where setrole='authenticator'::regrole and setting like 'pgrst.db_pre_request=%'
      and (setdatabase<>0 or setting <> 'pgrst.db_pre_request=public.evaorbit_agent_data_boundary')
  ) then
    raise exception 'Restore the recorded Data API pre-request configuration manually';
  end if;

  alter role authenticator reset pgrst.db_pre_request;
  for managed_policy in
    select schemaname,tablename from pg_policies where policyname='evaorbit_agent_data_path'
  loop
    execute format('drop policy evaorbit_agent_data_path on %I.%I',managed_policy.schemaname,managed_policy.tablename);
  end loop;
end $$;

-- With zero enrolled digests the Auth hook only issues the two legacy audiences.
delete from evaorbit_agent_private.bridge_keys;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
