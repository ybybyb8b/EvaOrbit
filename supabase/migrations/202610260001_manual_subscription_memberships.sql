begin;
alter table public.subscriptions add column if not exists mode text not null default 'recurring';
alter table public.subscriptions add column if not exists expires_on date;
alter table public.subscriptions add constraint subscription_membership_mode check(mode in('recurring','manual'));
-- Legacy date remains a compatibility mirror, never a manual payment schedule.
alter table public.subscriptions add constraint subscription_manual_expiry check(mode<>'manual' or (not auto_renew and expires_on is not null and next_renewal_on=expires_on));

alter table public.subscription_payments add column if not exists purchase_key text;
alter table public.subscription_payments add column if not exists valid_until date;
alter table public.subscription_payments add column if not exists purchased_value integer;
alter table public.subscription_payments add column if not exists purchased_unit text;
alter table public.subscription_payments add column if not exists bonus_value integer;
alter table public.subscription_payments add column if not exists bonus_unit text;
alter table public.subscription_payments add constraint subscription_purchase_metadata check(
 (purchase_key is null and valid_until is null and purchased_value is null and purchased_unit is null and bonus_value is null and bonus_unit is null)
 or (purchase_key is not null and purchase_key ~ '^[A-Za-z0-9_-]{8,100}$' and valid_until is not null and valid_until>=paid_on));
alter table public.subscription_payments add constraint subscription_purchase_duration check((purchased_value is null and purchased_unit is null) or (purchased_value is not null and purchased_unit is not null and purchased_value between 1 and 36500 and purchased_unit in('day','week','month','year')));
alter table public.subscription_payments add constraint subscription_bonus_duration check((bonus_value is null and bonus_unit is null) or (bonus_value is not null and bonus_unit is not null and bonus_value between 1 and 36500 and bonus_unit in('day','week','month','year')));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.subscription_payments'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (user_id, subscription_id, scheduled_for)' loop
  execute format('alter table public.subscription_payments drop constraint %I',c.conname);
 end loop;
end $$;
create unique index subscription_cycle_unique on public.subscription_payments(user_id,subscription_id,scheduled_for) where purchase_key is null;
create unique index subscription_purchase_unique on public.subscription_payments(user_id,subscription_id,purchase_key) where purchase_key is not null;

create or replace function public.record_subscription_purchase(
 p_subscription_id bigint,p_purchase_key text,p_paid_on date,p_amount_minor bigint,p_currency text,p_note text,p_valid_until date,
 p_purchased_value integer default null,p_purchased_unit text default null,p_bonus_value integer default null,p_bonus_unit text default null
) returns public.subscription_payments language plpgsql security invoker set search_path=public as $$
declare current_row public.subscriptions; payment public.subscription_payments; new_expiry date; latest_paid_on date;
begin
 select * into current_row from public.subscriptions where id=p_subscription_id and user_id=auth.uid() for update;
 if not found or current_row.mode<>'manual' then raise exception 'Manual membership not found'; end if;
 select * into payment from public.subscription_payments where user_id=auth.uid() and subscription_id=p_subscription_id and purchase_key=p_purchase_key;
 if found then
  if row(payment.paid_on,payment.amount_minor,payment.currency,payment.note,payment.valid_until,payment.purchased_value,payment.purchased_unit,payment.bonus_value,payment.bonus_unit)
   is distinct from row(p_paid_on,p_amount_minor,p_currency,coalesce(p_note,''),p_valid_until,p_purchased_value,p_purchased_unit,p_bonus_value,p_bonus_unit) then raise exception 'Purchase key already used for different data'; end if;
  return payment;
 end if;
 select max(paid_on) into latest_paid_on from public.subscription_payments where subscription_id=p_subscription_id and user_id=auth.uid();
 insert into public.subscription_payments(user_id,subscription_id,scheduled_for,paid_on,amount_minor,currency,note,purchase_key,valid_until,purchased_value,purchased_unit,bonus_value,bonus_unit)
 values(auth.uid(),p_subscription_id,p_paid_on,p_paid_on,p_amount_minor,p_currency,coalesce(p_note,''),p_purchase_key,p_valid_until,p_purchased_value,p_purchased_unit,p_bonus_value,p_bonus_unit) returning * into payment;
 -- Importing an older purchase must not shorten the current entitlement.
 new_expiry=case when latest_paid_on is null or p_paid_on>=latest_paid_on then p_valid_until else current_row.expires_on end;
 update public.subscriptions set expires_on=new_expiry,next_renewal_on=new_expiry,status='active',paused_at=null,ended_at=null where id=p_subscription_id and user_id=auth.uid();
 return payment;
end $$;
revoke all on function public.record_subscription_purchase(bigint,text,date,bigint,text,text,date,integer,text,integer,text) from public,anon;
grant execute on function public.record_subscription_purchase(bigint,text,date,bigint,text,text,date,integer,text,integer,text) to authenticated;

-- Guard the business RPC, not history INSERTs: restored history may predate a mode conversion.
create or replace function public.record_subscription_payment(
 p_subscription_id bigint,p_scheduled_for date,p_paid_on date,p_amount_minor bigint,
 p_currency text,p_note text,p_next_renewal_on date,p_update_current_price boolean
) returns public.subscription_payments language plpgsql security invoker set search_path=public as $$
declare current_row public.subscriptions; payment public.subscription_payments;
begin
 select * into current_row from public.subscriptions where id=p_subscription_id and user_id=auth.uid() for update;
 if not found or current_row.status<>'active' then raise exception 'Subscription not found or inactive'; end if;
 if current_row.mode='manual' then raise exception 'Manual membership requires record_purchase'; end if;
 if p_update_current_price and (current_row.current_amount_minor<>p_amount_minor or current_row.currency<>p_currency) then
  insert into public.subscription_price_changes(user_id,subscription_id,effective_on,old_amount_minor,new_amount_minor,old_currency,new_currency)
  values(auth.uid(),p_subscription_id,p_paid_on,current_row.current_amount_minor,p_amount_minor,current_row.currency,p_currency);
 end if;
 insert into public.subscription_payments(user_id,subscription_id,scheduled_for,paid_on,amount_minor,currency,note)
 values(auth.uid(),p_subscription_id,p_scheduled_for,p_paid_on,p_amount_minor,p_currency,coalesce(p_note,'')) returning * into payment;
 update public.subscriptions set next_renewal_on=p_next_renewal_on,current_amount_minor=case when p_update_current_price then p_amount_minor else current_amount_minor end,currency=case when p_update_current_price then p_currency else currency end
 where id=p_subscription_id and user_id=auth.uid();
 return payment;
end $$;
commit;
