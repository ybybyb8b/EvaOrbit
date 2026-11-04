begin;
alter table public.software_library add column if not exists purchase_amount_minor bigint;
alter table public.software_library add column if not exists purchase_currency text;
alter table public.software_library add constraint software_library_purchase_cost check (
 (purchase_amount_minor is null and purchase_currency is null) or
 (purchase_amount_minor is not null and purchase_amount_minor between 0 and 999999999999 and purchase_currency is not null and purchase_currency ~ '^[A-Z]{3}$')
);
-- Existing acquisitions retain unknown cost; giveaways are not assumed to have cost zero.
commit;
