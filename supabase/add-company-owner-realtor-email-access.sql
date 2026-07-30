-- Follow-up to add-company-owner-dispatch-access.sql and
-- add-company-owner-report-child-access.sql, which widened RLS so a
-- company owner can see/edit every inspection (and its findings/photos/
-- sections) on their team, not just their own.
--
-- This pass covers two more tables the app queries through the RLS-scoped
-- client that were still inspector-only:
--
-- realtors / realtor_contact_logs: no company_id column of their own -
-- ownership is expressed by matching the CREATOR's company_users row
-- against the CALLER's company_users row as owner of the same company.
--
-- email_logs: already has a company-owner-adjacent bypass from
-- rls-security-hardening-2.sql, but that bypass is keyed to the hardcoded
-- OWNER_EMAILS allowlist (the platform admin), not the company_users
-- "owner" role - a company owner who isn't Jeff still couldn't see a
-- teammate's email log. This adds the same real widening the other tables
-- got, additively, without touching the existing policies.
--
-- Run in the Supabase SQL Editor, then test as a company owner: the
-- Realtors page shows the whole team's contacts and referral stats, and
-- the Sent Emails page shows a teammate's report/agreement email sends.

-- =========================================================================
-- realtors
-- =========================================================================

drop policy if exists "Company owners manage company realtors" on public.realtors;

create policy "Company owners manage company realtors"
  on public.realtors
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.company_users creator_row
      join public.company_users owner_row
        on owner_row.company_id = creator_row.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where creator_row.user_id = realtors.inspector_id
    )
  )
  with check (
    exists (
      select 1
      from public.company_users creator_row
      join public.company_users owner_row
        on owner_row.company_id = creator_row.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where creator_row.user_id = realtors.inspector_id
    )
  );

-- =========================================================================
-- realtor_contact_logs
-- =========================================================================

drop policy if exists "Company owners manage company realtor contact logs" on public.realtor_contact_logs;

create policy "Company owners manage company realtor contact logs"
  on public.realtor_contact_logs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.company_users creator_row
      join public.company_users owner_row
        on owner_row.company_id = creator_row.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where creator_row.user_id = realtor_contact_logs.inspector_id
    )
  )
  with check (
    exists (
      select 1
      from public.company_users creator_row
      join public.company_users owner_row
        on owner_row.company_id = creator_row.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where creator_row.user_id = realtor_contact_logs.inspector_id
    )
  );

-- =========================================================================
-- email_logs (inspection_id_bigint, per rls-security-hardening-2.sql)
-- =========================================================================

drop policy if exists "Company owners manage company email logs" on public.email_logs;

create policy "Company owners manage company email logs"
  on public.email_logs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.inspections
      join public.company_users owner_row
        on owner_row.company_id = inspections.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where inspections.id = email_logs.inspection_id_bigint
    )
  )
  with check (
    exists (
      select 1
      from public.inspections
      join public.company_users owner_row
        on owner_row.company_id = inspections.company_id
       and owner_row.role = 'owner'
       and owner_row.user_id = auth.uid()
      where inspections.id = email_logs.inspection_id_bigint
    )
  );
