begin;

create or replace function public.reconcile_healthkit_menstrual_periods(p_user_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  episode record;
  resolved_period_id bigint;
begin
  -- A batch can contain ordinary flow samples before its cycle-start sample.
  -- Once the new period exists, move Apple Health samples to the latest period
  -- that had already started on their local day before calculating period ends.
  with resolved as (
    select f.id,(
      select p.id
      from public.menstrual_periods p
      where p.user_id=f.user_id
        and p.started_on<=(f.occurred_at at time zone 'Asia/Shanghai')::date
      order by p.started_on desc,p.id desc
      limit 1
    ) as period_id
    from public.menstrual_flow_records f
    where f.user_id=p_user_id and f.source='apple_health'
      and f.deleted_at is null and f.period_id is not null
  )
  update public.menstrual_flow_records f
  set period_id=resolved.period_id
  from resolved
  where f.id=resolved.id and f.user_id=p_user_id
    and resolved.period_id is not null
    and f.period_id is distinct from resolved.period_id;

  -- A later cycle starts a new period. Close the previous period on its last
  -- recorded flow day, never on the day before the next cycle.
  with bounds as (
    select p.id,max((f.occurred_at at time zone 'Asia/Shanghai')::date) as last_flow_on
    from public.menstrual_periods p
    join public.menstrual_flow_records f on f.user_id=p.user_id and f.period_id=p.id
    where p.user_id=p_user_id and f.deleted_at is null and f.flow<>'none'
      and exists (
        select 1 from public.menstrual_periods later
        where later.user_id=p.user_id and later.started_on>p.started_on
      )
    group by p.id
  )
  update public.menstrual_periods p
  set ended_on=b.last_flow_on
  from bounds b
  where p.id=b.id and p.user_id=p_user_id and p.ended_on is null;

  -- Apple Health does not guarantee cycle-start metadata on historical samples.
  -- Conservatively turn consecutive, positive, unassociated flow days into a
  -- closed period so Calendar can render the confirmed range.
  for episode in
    with flow_days as (
      select distinct (f.occurred_at at time zone 'Asia/Shanghai')::date as flow_on
      from public.menstrual_flow_records f
      where f.user_id=p_user_id and f.source='apple_health' and f.deleted_at is null
        and f.flow<>'none' and f.period_id is null
    ), numbered as (
      select flow_on,flow_on-(row_number() over(order by flow_on))::integer as island
      from flow_days
    )
    select min(flow_on) as started_on,max(flow_on) as ended_on
    from numbered group by island order by min(flow_on)
  loop
    resolved_period_id:=null;
    select p.id into resolved_period_id
    from public.menstrual_periods p
    where p.user_id=p_user_id and (
      p.started_on between episode.started_on-1 and episode.ended_on+1
      or p.ended_on between episode.started_on-1 and episode.ended_on+1
    )
    order by
      case when p.started_on<=episode.ended_on and coalesce(p.ended_on,p.started_on)>=episode.started_on then 0 else 1 end,
      abs(p.started_on-episode.started_on),p.id
    limit 1;

    if resolved_period_id is null then
      insert into public.menstrual_periods(user_id,started_on,ended_on,notes)
      values(p_user_id,episode.started_on,episode.ended_on,'') returning id into resolved_period_id;
    else
      update public.menstrual_periods
      set started_on=least(started_on,episode.started_on),
          ended_on=case when ended_on is null then null else greatest(ended_on,episode.ended_on) end
      where id=resolved_period_id and user_id=p_user_id;
    end if;

    update public.menstrual_flow_records
    set period_id=resolved_period_id
    where user_id=p_user_id and source='apple_health' and deleted_at is null
      and flow<>'none' and period_id is null
      and (occurred_at at time zone 'Asia/Shanghai')::date between episode.started_on and episode.ended_on;
  end loop;

  -- Only an explicit no-flow day after all confirmed bleeding closes an open
  -- period. An older no-flow record must not override later bleeding.
  with bounds as (
    select p.id,
      max((case when f.ended_at>f.occurred_at then f.ended_at-interval '1 microsecond' else f.occurred_at end
        at time zone 'Asia/Shanghai')::date) filter (where f.flow<>'none') as last_flow_on,
      max((f.occurred_at at time zone 'Asia/Shanghai')::date)
        filter (where f.flow='none' and f.source='apple_health') as no_flow_on
    from public.menstrual_periods p
    join public.menstrual_flow_records f on f.user_id=p.user_id and f.period_id=p.id
    where p.user_id=p_user_id and p.ended_on is null and f.deleted_at is null
    group by p.id
  )
  update public.menstrual_periods p set ended_on=b.last_flow_on
  from bounds b
  where p.id=b.id and p.user_id=p_user_id and p.ended_on is null
    and b.last_flow_on>=p.started_on and b.no_flow_on>b.last_flow_on;
end; $$;

do $$
declare owner record;
begin
  for owner in select distinct user_id from public.menstrual_flow_records where source='apple_health' loop
    perform public.reconcile_healthkit_menstrual_periods(owner.user_id);
  end loop;
end; $$;

revoke all on function public.reconcile_healthkit_menstrual_periods(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_healthkit_menstrual_periods(uuid) to service_role;

commit;
