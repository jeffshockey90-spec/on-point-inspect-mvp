-- Apple In-App Purchase (StoreKit via RevenueCat) subscription support.
--
-- App Store Review Guideline 3.1.1 requires that a subscription unlocked inside
-- the iOS app be purchasable with In-App Purchase. Guideline 3.1.3(b)
-- (Multiplatform Services) then lets us keep honoring subscriptions bought on
-- the web with Stripe, so existing web subscribers are unaffected on iOS.
--
-- That means an account can be entitled from EITHER billing source, and the two
-- must not fight over one column. Stripe keeps writing subscription_status;
-- Apple state lands in its own apple_* columns, written by the RevenueCat
-- webhook (app/api/revenuecat/webhook) and the post-purchase sync
-- (app/api/revenuecat/sync). "Entitled" is the OR of the two.
--
-- Run in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists apple_subscription_status text,
  add column if not exists apple_expires_at timestamptz,
  add column if not exists apple_product_id text,
  add column if not exists apple_original_transaction_id text,
  add column if not exists revenuecat_app_user_id text;

comment on column public.profiles.apple_subscription_status is
  'Last RevenueCat event type for this subscriber (diagnostics only - entitlement is decided by apple_expires_at).';
comment on column public.profiles.apple_expires_at is
  'When the Apple subscription lapses. RevenueCat already folds grace/billing-retry periods into this date, so a future value means entitled.';

create index if not exists profiles_revenuecat_app_user_id_idx
  on public.profiles (revenuecat_app_user_id);

-- Entitlement via Apple IAP. RevenueCat's expiration date already accounts for
-- grace and billing-retry periods, so a future expiry is the whole test - we
-- deliberately don't also gate on the event type, which would lock out someone
-- mid-grace-period after a BILLING_ISSUE event.
create or replace function public.has_apple_subscription(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select apple_expires_at > now()
       from public.profiles
      where id = target_user_id),
    false
  );
$$;

-- Replaces the version in enforce-subscription-gate.sql. Same logic, plus the
-- Apple check: without it an inspector who subscribed through the App Store
-- would pass the in-app check and then be rejected by RLS on insert.
create or replace function public.can_create_inspection(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
  used_count integer;
  limit_count integer;
begin
  select subscription_status, subscription_exempt, subscription_required,
         free_inspection_limit, free_inspections_used, apple_expires_at
    into profile_row
    from public.profiles
   where id = target_user_id;

  -- No profile row (shouldn't happen for a real signed-in inspector) -
  -- fail open rather than lock out an account we can't evaluate.
  if not found then
    return true;
  end if;

  if profile_row.subscription_required is false then
    return true;
  end if;

  if profile_row.subscription_exempt is true then
    return true;
  end if;

  -- Stripe (web/Android).
  if lower(coalesce(profile_row.subscription_status, '')) in ('active', 'trialing') then
    return true;
  end if;

  -- Apple IAP (iOS).
  if profile_row.apple_expires_at is not null and profile_row.apple_expires_at > now() then
    return true;
  end if;

  select count(*) into used_count
    from public.inspections
   where inspector_id = target_user_id
     and coalesce(is_demo, false) = false;

  limit_count := coalesce(profile_row.free_inspection_limit, 3);

  return greatest(used_count, coalesce(profile_row.free_inspections_used, 0)) < limit_count;
end;
$$;
