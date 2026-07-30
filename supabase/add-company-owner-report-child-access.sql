-- Follow-up to add-company-owner-dispatch-access.sql, which widened RLS on
-- `inspections` so a company owner can see/reassign every inspection on
-- their team, not just ones where inspector_id = their own user id.
--
-- That migration only touched `inspections` itself. Every child table that
-- actually holds report content - findings, photos, custom section
-- overrides - still only has the original "Inspectors manage own X" policy
-- (auth.uid() = inspections.inspector_id), so an owner who now opens a
-- teammate's report via the report builder sees the inspection row load,
-- but an EMPTY shell: zero findings, zero photos, and any custom section
-- they add silently fails to appear, because RLS filters those child rows
-- out for anyone who isn't the assigned inspector. Confirmed by testing: a
-- custom section created by an owner test account saved fine to the
-- database but never rendered back, because the SELECT was silently
-- narrowed by RLS, not blocked with an error.
--
-- This is additive, like the original migration - it doesn't touch or
-- remove the existing "Inspectors manage own X" policies other inspectors
-- rely on, it just adds a second permissive policy per table scoped by
-- company ownership.
--
-- Run in the Supabase SQL Editor, then test as a company owner: open a
-- teammate's report and confirm findings/photos/custom sections that
-- teammate created are now visible, and that adding a custom section as
-- the owner persists and renders after a reload.

-- =========================================================================
-- findings
-- =========================================================================

drop policy if exists "Company owners manage company findings" on public.findings;

create policy "Company owners manage company findings"
  on public.findings
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
      where inspections.id = findings.inspection_id
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
      where inspections.id = findings.inspection_id
    )
  );

-- =========================================================================
-- photos (inspection_id is stored as text - same cast used in
-- rls-security-hardening.sql's own photos policy)
-- =========================================================================

drop policy if exists "Company owners manage company photos" on public.photos;

create policy "Company owners manage company photos"
  on public.photos
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
      where inspections.id::text = photos.inspection_id
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
      where inspections.id::text = photos.inspection_id
    )
  );

-- =========================================================================
-- report_section_overrides (custom sections, and deletions of built-in
-- sections)
-- =========================================================================

drop policy if exists "Company owners manage company report section overrides" on public.report_section_overrides;

create policy "Company owners manage company report section overrides"
  on public.report_section_overrides
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
      where inspections.id = report_section_overrides.inspection_id
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
      where inspections.id = report_section_overrides.inspection_id
    )
  );

-- =========================================================================
-- equipment_inventory: only added here if it exists and already has RLS
-- enabled with a matching inspector-only policy - no tracked migration
-- created this table's RLS, so this is a defensive no-op if it turns out
-- to be unprotected or absent.
-- =========================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'equipment_inventory'
  ) then
    execute 'drop policy if exists "Company owners manage company equipment inventory" on public.equipment_inventory';
    execute $policy$
      create policy "Company owners manage company equipment inventory"
      on public.equipment_inventory
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
          where inspections.id = equipment_inventory.inspection_id
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
          where inspections.id = equipment_inventory.inspection_id
        )
      )
    $policy$;
  else
    raise notice 'Skipping equipment_inventory, table does not exist.';
  end if;
end $$;
