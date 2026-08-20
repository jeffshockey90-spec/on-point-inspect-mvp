-- =====================================================================
-- Lock the `companies` table (last table readable by the public anon key).
--
-- After this, a company row is only reachable by:
--   * an authenticated member of that company (via company_users)
--   * the platform owner
--   * the service-role key (public inspector profiles, signup, all API routes)
-- The anon (public, not-logged-in) role gets NOTHING.
--
-- Safe: public profiles read via service-role (bypass RLS); the only browser
-- read of companies is the live-activity widget reading the user's OWN company,
-- which the member policy allows. No browser writes exist.
--
-- Rollback: alter table public.companies disable row level security;
-- =====================================================================

-- is_platform_owner() already exists from enable-inspection-rls.sql; recreated
-- here so this file is runnable on its own.
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

-- Is the current authenticated user a member of this company?
create or replace function public.is_company_member(target bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target and cu.user_id = auth.uid()
  );
$$;

alter table public.companies enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'companies'
  loop execute format('drop policy if exists %I on public.companies', p.policyname); end loop;
end $$;
create policy companies_member_access on public.companies
  for all to authenticated
  using (public.is_platform_owner() or public.is_company_member(id))
  with check (public.is_platform_owner() or public.is_company_member(id));
