begin;
-- Update the existing financial fact, under the same membership lock as purchase creation.
create or replace function public.update_subscription_purchase(
 p_subscription_id bigint,p_payment_id bigint,p_input jsonb,p_original jsonb
) returns public.subscription_payments language plpgsql security invoker set search_path=public as $$
declare current_row public.subscriptions; payment public.subscription_payments; latest public.subscription_payments;
 snapshot jsonb; dates_changed boolean;
begin
 select * into current_row from public.subscriptions where id=p_subscription_id and user_id=auth.uid() for update;
 if not found or current_row.mode<>'manual' then raise exception 'Manual purchase not found'; end if;
 select * into payment from public.subscription_payments where id=p_payment_id and subscription_id=p_subscription_id and user_id=auth.uid() for update;
 if not found or payment.purchase_key is null then raise exception 'Manual purchase not found'; end if;
 if p_input->>'purchaseKey' is distinct from payment.purchase_key or p_original->>'purchaseKey' is distinct from payment.purchase_key then raise exception 'Purchase key cannot change'; end if;
 snapshot=jsonb_build_object('purchaseKey',payment.purchase_key,'paidOn',payment.paid_on,'amountMinor',payment.amount_minor,'currency',payment.currency,'note',payment.note,'validUntil',payment.valid_until,'purchasedValue',payment.purchased_value,'purchasedUnit',payment.purchased_unit,'bonusValue',payment.bonus_value,'bonusUnit',payment.bonus_unit);
 if snapshot=p_input then return payment; end if;
 if snapshot is distinct from p_original then raise exception 'Purchase changed; refresh before editing'; end if;
 if (p_input->>'paidOn')::date>(now() at time zone 'Asia/Shanghai')::date then raise exception 'Purchase date cannot be in future'; end if;
 select * into latest from public.subscription_payments where subscription_id=p_subscription_id and user_id=auth.uid() and purchase_key is not null order by paid_on desc,id desc limit 1;
 dates_changed=payment.paid_on is distinct from (p_input->>'paidOn')::date or payment.valid_until is distinct from (p_input->>'validUntil')::date;
 update public.subscription_payments set scheduled_for=(p_input->>'paidOn')::date,paid_on=(p_input->>'paidOn')::date,
 amount_minor=(p_input->>'amountMinor')::bigint,currency=p_input->>'currency',note=p_input->>'note',valid_until=(p_input->>'validUntil')::date,
 purchased_value=(p_input->>'purchasedValue')::integer,purchased_unit=p_input->>'purchasedUnit',bonus_value=(p_input->>'bonusValue')::integer,bonus_unit=p_input->>'bonusUnit'
 where id=p_payment_id and subscription_id=p_subscription_id and user_id=auth.uid() returning * into payment;
 -- A separately corrected current expiry remains authoritative; editing history does not restore ended memberships.
 if dates_changed and latest.valid_until=current_row.expires_on then
  select * into latest from public.subscription_payments where subscription_id=p_subscription_id and user_id=auth.uid() and purchase_key is not null order by paid_on desc,id desc limit 1;
  update public.subscriptions set expires_on=latest.valid_until,next_renewal_on=latest.valid_until where id=p_subscription_id and user_id=auth.uid();
 end if;
 return payment;
end $$;
revoke all on function public.update_subscription_purchase(bigint,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.update_subscription_purchase(bigint,bigint,jsonb,jsonb) to authenticated;
commit;
