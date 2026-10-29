-- Admin maintenance only. The caller must resolve and verify the account from
-- known report identities, then set this transaction-local setting.
-- Delete children first; never cascade into original business records.
delete from public.insight_run_attempts
where user_id = current_setting('evaorbit.retire_insight_user')::uuid;
delete from public.insight_runs
where user_id = current_setting('evaorbit.retire_insight_user')::uuid;
delete from public.insight_report_versions
where user_id = current_setting('evaorbit.retire_insight_user')::uuid;
delete from public.insight_reports
where user_id = current_setting('evaorbit.retire_insight_user')::uuid;
