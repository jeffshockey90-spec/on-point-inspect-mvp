-- Only a company's OWNER (or the platform owner / service role) may change its
-- Stripe payout fields.
--
-- companies_member_access (lock-companies-rls.sql) lets every company member
-- UPDATE every column of their company. That includes stripe_account_id, so a
-- member could point the company's payouts at a Stripe account they control
-- (every client payment is a direct charge on companies.stripe_account_id).
-- The onboarding API route now checks the owner role; this trigger closes the
-- direct-table path. Other company fields keep their current access.
--
-- Service-role writes (webhooks, server jobs) have no auth.uid() and are not
-- affected. Safe to re-run.

create or replace function public.guard_company_stripe_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_owner() then
    return new;
  end if;

  if (new.stripe_account_id is distinct from old.stripe_account_id)
     or (new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete)
     or (new.stripe_charges_enabled is distinct from old.stripe_charges_enabled)
     or (new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled)
     or (new.stripe_details_submitted is distinct from old.stripe_details_submitted)
  then
    if not exists (
      select 1 from public.company_users cu
      where cu.company_id = new.id
        and cu.user_id = auth.uid()
        and lower(coalesce(cu.role, '')) = 'owner'
    ) then
      raise exception 'Only the company owner can change Stripe payout settings.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_company_stripe_columns on public.companies;
create trigger guard_company_stripe_columns
  before update on public.companies
  for each row execute function public.guard_company_stripe_columns();
