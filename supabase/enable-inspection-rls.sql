-- =====================================================================
-- CRITICAL SECURITY FIX: lock down inspection data.
--
-- The public anon key (shipped in the app's JS) could read EVERY
-- inspection, finding, and photo. This enables Row-Level Security so:
--   * an inspector can only read/write THEIR OWN inspections/findings/photos
--   * the platform owner (OWNER_EMAILS) can see everything
--   * the SERVICE-ROLE key BYPASSES RLS -> sending reports, client/realtor
--     portals, share links, PDF downloads, and offline sync all keep working
--     unchanged (they run server-side with the service-role key)
--   * the anon (public, not-logged-in) role gets NOTHING
--
-- Note: photos.inspection_id / findings.inspection_id are stored with mixed
-- types (text vs int) across tables, so ownership is checked via TEXT to stay
-- type-safe.
--
-- Safe to re-run. To ROLL BACK if anything breaks:
--   alter table public.inspections disable row level security;
--   alter table public.findings     disable row level security;
--   alter table public.photos        disable row level security;
-- =====================================================================

-- Platform owner check (full access).
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

-- Does the current authenticated user own this inspection (id compared as text
-- so it works whether the caller passes an int or text id)? SECURITY DEFINER so
-- the findings/photos checks don't recurse through inspections' own RLS.
create or replace function public.owns_inspection_txt(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inspections i
    where i.id::text = target
      and i.inspector_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- inspections  (inspector_id is the owning auth user)
-- ---------------------------------------------------------------------
alter table public.inspections enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'inspections'
  loop execute format('drop policy if exists %I on public.inspections', p.policyname); end loop;
end $$;
create policy inspections_self_access on public.inspections
  for all to authenticated
  using (inspector_id = auth.uid() or public.is_platform_owner())
  with check (inspector_id = auth.uid() or public.is_platform_owner());

-- ---------------------------------------------------------------------
-- findings  (belong to an inspection)
-- ---------------------------------------------------------------------
alter table public.findings enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'findings'
  loop execute format('drop policy if exists %I on public.findings', p.policyname); end loop;
end $$;
create policy findings_self_access on public.findings
  for all to authenticated
  using (public.is_platform_owner() or public.owns_inspection_txt(inspection_id::text))
  with check (public.is_platform_owner() or public.owns_inspection_txt(inspection_id::text));

-- ---------------------------------------------------------------------
-- photos  (belong to an inspection, sometimes only to a finding)
-- ---------------------------------------------------------------------
alter table public.photos enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'photos'
  loop execute format('drop policy if exists %I on public.photos', p.policyname); end loop;
end $$;
create policy photos_self_access on public.photos
  for all to authenticated
  using (
    public.is_platform_owner()
    or public.owns_inspection_txt(inspection_id)
    or exists (
      select 1 from public.findings f
      where f.id::text = photos.finding_id
        and public.owns_inspection_txt(f.inspection_id::text)
    )
  )
  with check (
    public.is_platform_owner()
    or public.owns_inspection_txt(inspection_id)
    or exists (
      select 1 from public.findings f
      where f.id::text = photos.finding_id
        and public.owns_inspection_txt(f.inspection_id::text)
    )
  );
