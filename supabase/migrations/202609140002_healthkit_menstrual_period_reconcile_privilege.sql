begin;

grant execute on function public.reconcile_healthkit_menstrual_periods(uuid) to service_role;

commit;
