-- URGENT FIX for add-company-owner-team-visibility.sql, which is already
-- live in production and broken.
--
-- That migration added a policy on company_users whose USING clause
-- queries company_users itself (a self-referencing EXISTS subquery). In
-- Postgres, RLS policies apply to every scan of a table, including scans
-- inside another policy's own subquery on that same table - so evaluating
-- the policy re-triggers the policy, over and over. Confirmed directly
-- against the live database:
--
--   infinite recursion detected in policy for relation "company_users"
--
-- This doesn't just break the realtors page - it breaks EVERY read of
-- company_users for EVERY authenticated user, and by extension anything
-- that joins to it (which is most of the company-owner-access work from
-- this session). Run this immediately.
--
-- The fix is the standard Postgres pattern for self-referencing RLS: move
-- the lookup into a SECURITY DEFINER function. That function runs with
-- the privileges of whoever created it (bypassing RLS internally for its
-- own query), so calling it from a policy does not re-trigger the policy
-- and cannot recurse.

create or replace function public.is_company_owner(target_company_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_users
    where user_id = auth.uid()
      and role = 'owner'
      and company_id = target_company_id
  );
$$;

drop policy if exists "Company owners can read their team's membership" on public.company_users;

create policy "Company owners can read their team's membership"
  on public.company_users
  for select
  to authenticated
  using (public.is_company_owner(company_id));
