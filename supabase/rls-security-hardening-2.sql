-- FLOW Row-Level Security Hardening - Pass 2
-- Run in Supabase SQL Editor.
--
-- Follow-up to rls-security-hardening.sql. That pass covered inspections/
-- findings/photos/clients. Running its own diagnostic afterward turned up a
-- leftover "Public read inspections" policy (qual = true) that silently
-- overrode the correct published-only policy - already dropped separately.
-- This pass covers the same class of bug found on other tables via:
--
--   select tablename, policyname, cmd, roles, qual from pg_policies
--   where schemaname = 'public' and qual::text = 'true';
--
-- Column types were verified against live data before writing the casts
-- below (ai_logs.inspection_id / email_logs.inspection_id_bigint /
-- stripe_logs.inspection_id are bigint; inspection_ai_memory_events and
-- offline_sync_receipts store inspection_id as text - same quirk as the
-- photos table in pass 1).
--
-- app/admin/logs/page.tsx reads ai_logs/audit_logs/app_logs/email_logs/
-- stripe_logs through the session-authenticated client (not service role),
-- so simply scoping these to "own user_id" would break that page for the
-- owner, since most rows belong to other users' actions. The policies below
-- add an explicit owner-email bypass so that page keeps working while every
-- other authenticated account is limited to their own rows.
--
-- Run this in one sitting, then test (logged in as the owner): /admin/logs
-- still shows all companies' log rows, and a report builder page still
-- loads normally. If anything breaks, the fastest rollback is
-- `alter table <name> disable row level security;` for the affected table.

-- =========================================================================
-- app_native_push_tokens: every reference to this table in the app code
-- (registration, sending, admin device lists) uses the service-role client
-- - nothing legitimate reads/writes it via the browser client. The existing
-- policy is named "Service role can manage native push tokens" but was
-- actually created `to public` with `qual = true`, making it readable and
-- writable by anyone, including logged-out requests. Service role already
-- bypasses RLS, so this policy has zero legitimate purpose - drop it.
-- =========================================================================

drop policy if exists "Service role can manage native push tokens" on public.app_native_push_tokens;

-- =========================================================================
-- ai_logs / audit_logs / app_logs: currently readable by ANY authenticated
-- user (qual = true), leaking every company's AI usage, audit trail, and
-- app activity to every other company's inspector account.
-- =========================================================================

drop policy if exists "Authenticated users can view ai logs" on public.ai_logs;
create policy "Users can view own ai logs, owner can view all"
on public.ai_logs
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

drop policy if exists "Authenticated users can view audit logs" on public.audit_logs;
create policy "Users can view own audit logs, owner can view all"
on public.audit_logs
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

drop policy if exists "Authenticated users can view app logs" on public.app_logs;
create policy "Users can view own app logs, owner can view all"
on public.app_logs
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

-- =========================================================================
-- email_logs / stripe_logs: no direct user_id column, but both carry the
-- inspection_id they belong to. Scope to inspections owned by the caller,
-- plus the same owner-email bypass /admin/logs relies on.
-- =========================================================================

drop policy if exists "Authenticated users can view email logs" on public.email_logs;
create policy "Inspectors can view own email logs, owner can view all"
on public.email_logs
for select
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = email_logs.inspection_id_bigint
    and inspections.inspector_id = auth.uid()
  )
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

drop policy if exists "Authenticated users can view stripe logs" on public.stripe_logs;
create policy "Inspectors can view own stripe logs, owner can view all"
on public.stripe_logs
for select
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = stripe_logs.inspection_id
    and inspections.inspector_id = auth.uid()
  )
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

-- =========================================================================
-- booking_requests: currently readable/updatable by ANY authenticated
-- inspector account. There is no company_id column, and inspector_id is
-- only set once a request is claimed (confirmed in
-- app/api/booking-requests/update/route.ts) - it's null on every brand new
-- request, and the create route sends its owner-alert notification to a
-- single hardcoded address regardless of which inspector account exists
-- (confirmed in app/api/booking-requests/create/route.ts), so this table
-- has no real per-company routing today.
--
-- This policy is a partial fix, not a full one: it still lets any
-- authenticated inspector see/claim a brand-new unclaimed request (needed
-- for the existing "first inspector to open it claims it" workflow), but
-- once a request is claimed (inspector_id is set), only that inspector -
-- or the owner - can see or touch it. If you have real separate companies
-- relying on this booking form, closing the "any inspector can see
-- everyone's unclaimed new leads" gap needs a company identifier captured
-- at submission time, which is a bigger change than this migration.
-- =========================================================================

drop policy if exists "booking requests readable by authenticated users" on public.booking_requests;
create policy "Unclaimed or own booking requests are readable"
on public.booking_requests
for select
to authenticated
using (
  inspector_id is null
  or auth.uid() = inspector_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

drop policy if exists "booking requests updatable by authenticated users" on public.booking_requests;
create policy "Unclaimed or own booking requests are updatable"
on public.booking_requests
for update
to authenticated
using (
  inspector_id is null
  or auth.uid() = inspector_id
  or lower(auth.jwt() ->> 'email') in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com')
);

-- =========================================================================
-- inspection_ai_memory_events / offline_sync_receipts: same idea, but these
-- store inspection_id as text (confirmed against live data), and the
-- existing policy covers ALL commands (not just SELECT) with qual = true -
-- meaning any authenticated user could also modify/delete other inspectors'
-- rows, not just read them. Neither is read from an owner-wide admin page
-- today, so no owner-email bypass is needed here.
-- =========================================================================

drop policy if exists "Authenticated AI memory access" on public.inspection_ai_memory_events;
create policy "Inspectors manage own AI memory events"
on public.inspection_ai_memory_events
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id::text = inspection_ai_memory_events.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id::text = inspection_ai_memory_events.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);

drop policy if exists "Authenticated offline receipt access" on public.offline_sync_receipts;
create policy "Inspectors manage own offline sync receipts"
on public.offline_sync_receipts
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id::text = offline_sync_receipts.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id::text = offline_sync_receipts.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);
