-- Keep owner isolation and the existing authenticated MCP Data API proof boundary.
-- No existing OAuth connection is granted new permissions by this migration.
alter policy important_dates_owner on public.important_dates
  using (user_id=auth.uid()) with check (user_id=auth.uid());
alter policy important_date_categories_owner on public.important_date_categories
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists evaorbit_agent_data_path on public.important_dates;
create policy evaorbit_agent_data_path on public.important_dates as restrictive for all to authenticated
  using (not (select public.evaorbit_is_external_oauth()) or (select current_setting('evaorbit.agent_bridge_verified',true))='yes')
  with check (not (select public.evaorbit_is_external_oauth()) or (select current_setting('evaorbit.agent_bridge_verified',true))='yes');
drop policy if exists evaorbit_agent_data_path on public.important_date_categories;
create policy evaorbit_agent_data_path on public.important_date_categories as restrictive for all to authenticated
  using (not (select public.evaorbit_is_external_oauth()) or (select current_setting('evaorbit.agent_bridge_verified',true))='yes')
  with check (not (select public.evaorbit_is_external_oauth()) or (select current_setting('evaorbit.agent_bridge_verified',true))='yes');
