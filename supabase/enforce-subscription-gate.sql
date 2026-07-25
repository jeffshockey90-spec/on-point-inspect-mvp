-- Server-side enforcement of the free-inspection limit.
--
-- app/inspections/new/page.tsx already checks subscription_status /
-- free_inspection_limit / free_inspections_used in the browser before
-- letting someone create an inspection - but the actual insert goes
-- straight through the browser's Supabase client, and the existing RLS
-- policy ("Inspectors manage own inspections", see
-- rls-security-hardening.sql) only checks auth.uid() = inspector_id, not
-- subscription status. Anyone who calls the insert directly (devtools,
-- a script) bypasses the free-tier limit entirely.
--
-- This adds a RESTRICTIVE policy, which ANDs with the existing permissive
-- policy rather than replacing it - so it can only narrow access, never
-- widen it, and every other inspections policy keeps working unchanged.
-- Restrictive policies only apply to the "authenticated"/"anon" roles they
-- run under; API routes and scripts using the service-role key bypass RLS
-- entirely, same as before, so internal/admin-driven inspection creation
-- is unaffected.
--
-- Run in the Supabase SQL Editor.

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
         free_inspection_limit, free_inspections_used
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

  if lower(coalesce(profile_row.subscription_status, '')) in ('active', 'trialing') then
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

drop policy if exists "Enforce free inspection limit" on public.inspections;

create policy "Enforce free inspection limit"
  on public.inspections
  as restrictive
  for insert
  to authenticated
  with check (public.can_create_inspection(inspector_id));
