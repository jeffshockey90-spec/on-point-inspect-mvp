-- Root-cause fix for the realtors company-wide access just shipped.
--
-- resolveTeamInspectorIds (lib/inspectionAccess.ts) works by looking up
-- every company_users row for an owner's company, to build the list of
-- inspector_ids that count as "my team." But the existing policy on
-- company_users (from scope-companies-and-booking-requests.sql) only lets
-- a user read their OWN membership row:
--
--   using (user_id = auth.uid())
--
-- So that lookup was silently returning just the owner themselves, never
-- their teammates - which is why the realtors page still showed 0 contacts
-- for an owner even after the realtors-table policy was added: the
-- teamIds list going into that query only ever contained the owner's own
-- id. This is additive, like every other policy in this series - it does
-- not touch the existing "own membership" policy, it just adds a second
-- permissive one for company owners.
--
-- Run in the Supabase SQL Editor, then reload /realtors as a company
-- owner - teammates' realtor contacts and referral stats should now
-- appear.

drop policy if exists "Company owners can read their team's membership" on public.company_users;

create policy "Company owners can read their team's membership"
  on public.company_users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_users owner_row
      where owner_row.user_id = auth.uid()
        and owner_row.role = 'owner'
        and owner_row.company_id = company_users.company_id
    )
  );
