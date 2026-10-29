begin;
-- Retire the report writer independently of client deployments and old Agent leases.
-- Keep legacy tables and functions for schema/backup compatibility; Context uses
-- only the original business tables and needs none of these RPCs.
revoke execute on function
  public.save_insight_report(date,date,integer,uuid,text,jsonb),
  public.save_insight_report_snapshot(date,date,integer,uuid,text,jsonb),
  public.claim_insight_run(date,uuid,jsonb,boolean),
  public.finish_insight_run(uuid,jsonb,text),
  public.fail_insight_run(uuid,text,boolean),
  public.queue_insight_run(date,text,integer),
  public.queue_insight_run_review(date,text,integer),
  public.delete_insight_report(uuid,integer,integer)
from public,anon,authenticated;
commit;
