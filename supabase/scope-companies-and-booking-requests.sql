-- =========================================================================
-- companies / company_users: currently have ZERO RLS policies, meaning any
-- request using the anon/authenticated Supabase key (not the service-role
-- key) could read or write any company's row directly if any client-side
-- code ever queried these tables. Locks both down: service-role (used by
-- signup, owner admin routes, and all server-side branding lookups) keeps
-- full access since it bypasses RLS entirely; authenticated users can only
-- read their OWN company/membership row - enough for a future "my company
-- settings" page, and for the booking_requests policy below to check
-- company membership without a chicken-and-egg RLS problem.
-- =========================================================================

alter table public.companies enable row level security;

drop policy if exists "Users can read their own company" on public.companies;
create policy "Users can read their own company"
on public.companies
for select
to authenticated
using (
  id in (
    select company_id from public.company_users where user_id = auth.uid()
  )
);

alter table public.company_users enable row level security;

drop policy if exists "Users can read their own membership" on public.company_users;
create policy "Users can read their own membership"
on public.company_users
for select
to authenticated
using (user_id = auth.uid());

-- =========================================================================
-- booking_requests: add company_id so a public booking submitted through a
-- specific company's link (/book?inspector=<profile_slug>) is actually tied
-- to that company, instead of every request landing in one shared,
-- unscoped pool that any authenticated inspector can see and claim.
--
-- Existing/legacy requests (company_id null - submitted before this fix, or
-- through the plain /book link with no company resolved) keep the old
-- "any inspector can see and claim an unclaimed request" behavior so
-- nothing breaks. New company-scoped requests are only visible to that
-- company's own members (or the platform owner) until claimed.
-- =========================================================================

alter table public.booking_requests add column if not exists company_id bigint references public.companies(id);

drop policy if exists "Unclaimed or own booking requests are readable" on public.booking_requests;
create policy "Company-scoped or unclaimed booking requests are readable"
on public.booking_requests
for select
to authenticated
using (
  auth.uid() = inspector_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
  or (
    company_id is not null
    and exists (
      select 1 from public.company_users cu
      where cu.company_id = booking_requests.company_id
      and cu.user_id = auth.uid()
    )
  )
  or (company_id is null and inspector_id is null)
);

drop policy if exists "Unclaimed or own booking requests are updatable" on public.booking_requests;
create policy "Company-scoped or unclaimed booking requests are updatable"
on public.booking_requests
for update
to authenticated
using (
  auth.uid() = inspector_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
  or (
    company_id is not null
    and exists (
      select 1 from public.company_users cu
      where cu.company_id = booking_requests.company_id
      and cu.user_id = auth.uid()
    )
  )
  or (company_id is null and inspector_id is null)
);
