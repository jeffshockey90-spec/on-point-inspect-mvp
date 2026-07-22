-- FLOW Row-Level Security Hardening
-- Run in Supabase SQL Editor.
--
-- IMPORTANT - READ BEFORE RUNNING:
-- supabase/schema.sql (the tracked schema file) is significantly out of
-- date and does not match your live database - it shows inspections.id as
-- a uuid with no inspector_id column, but the live app clearly uses a
-- bigint sequential id and an inspector_id uuid column throughout (this was
-- confirmed by reading actual application code, not the schema file).
--
-- The column names used below (inspector_id, published, public_share_token,
-- inspection_id, finding_id) were verified against how the live app code
-- actually queries these tables. Still, BEFORE running this migration,
-- it's worth double-checking your real columns with:
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'inspections' order by ordinal_position;
--
-- (repeat for clients, findings, photos) so a mismatch surfaces as a clear
-- SQL error instead of a policy that silently does the wrong thing.
--
-- Run this in one sitting, then immediately test (while logged in as
-- yourself): the dashboard/reports list loads your inspections, a report
-- builder page loads its findings/photos, and (logged out / incognito) a
-- published report's public /share/ link still opens. If anything breaks,
-- the fastest rollback is `alter table <name> disable row level security;`
-- for the affected table.

-- =========================================================================
-- inspections: the core table. Owner (inspector) gets full access to their
-- own rows. Published reports are additionally readable by anyone (this is
-- what makes /share, /client-portal, /environmental-share work without a
-- login) - draft/unpublished reports are never publicly readable.
-- =========================================================================

alter table public.inspections enable row level security;

drop policy if exists "Inspectors manage own inspections" on public.inspections;
create policy "Inspectors manage own inspections"
on public.inspections
for all
to authenticated
using (auth.uid() = inspector_id)
with check (auth.uid() = inspector_id);

drop policy if exists "Published inspections are publicly readable" on public.inspections;
create policy "Published inspections are publicly readable"
on public.inspections
for select
to anon, authenticated
using (published = true);

-- =========================================================================
-- findings: owned via the parent inspection. Same visibility rule -
-- inspector sees/edits their own; anyone can read findings that belong to
-- a published inspection (needed for the public report pages).
-- =========================================================================

alter table public.findings enable row level security;

drop policy if exists "Inspectors manage own findings" on public.findings;
create policy "Inspectors manage own findings"
on public.findings
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = findings.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id = findings.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);

drop policy if exists "Findings on published inspections are publicly readable" on public.findings;
create policy "Findings on published inspections are publicly readable"
on public.findings
for select
to anon, authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = findings.inspection_id
    and inspections.published = true
  )
);

-- =========================================================================
-- photos: has its own inspection_id column (confirmed in app code), so it
-- doesn't need to join through findings.
-- =========================================================================

alter table public.photos enable row level security;

drop policy if exists "Inspectors manage own photos" on public.photos;
create policy "Inspectors manage own photos"
on public.photos
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id::text = photos.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id::text = photos.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);

drop policy if exists "Photos on published inspections are publicly readable" on public.photos;
create policy "Photos on published inspections are publicly readable"
on public.photos
for select
to anon, authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id::text = photos.inspection_id
    and inspections.published = true
  )
);

-- =========================================================================
-- clients: confirmed inspector_id column via app/clients/page.tsx. No
-- legitimate public-read need anywhere in the app - inspector-only.
-- =========================================================================

alter table public.clients enable row level security;

drop policy if exists "Inspectors manage own clients" on public.clients;
create policy "Inspectors manage own clients"
on public.clients
for all
to authenticated
using (auth.uid() = inspector_id)
with check (auth.uid() = inspector_id);

-- =========================================================================
-- templates, quote_items, ai_photo_reviews, ai_comment_presets: not
-- referenced anywhere in the current app codebase (verified by search) -
-- likely leftover from an earlier version. Enabling RLS with zero policies
-- blocks all client-SDK access (anon and authenticated) while leaving
-- service-role (server-side only, already bypasses RLS) unaffected. If you
-- know these are still used somewhere, tell me and I'll add a proper
-- ownership policy instead of leaving them fully locked down.
-- =========================================================================

do $$
declare
  legacy_table text;
begin
  foreach legacy_table in array array['templates', 'quote_items', 'ai_photo_reviews', 'ai_comment_presets']
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = legacy_table
    ) then
      execute format('alter table public.%I enable row level security', legacy_table);
    else
      raise notice 'Skipping %, table does not exist.', legacy_table;
    end if;
  end loop;
end $$;
