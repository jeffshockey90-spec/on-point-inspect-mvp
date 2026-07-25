-- Lets a company owner see and reassign every inspection in their own
-- company, not just inspections where inspector_id = their own user id.
--
-- Today the only SELECT/UPDATE policy on inspections is "Inspectors manage
-- own inspections" (auth.uid() = inspector_id) - so on a team with more than
-- one inspector, the owner has no way to see a teammate's schedule at all,
-- and there's no dispatch/assignment view possible. This adds a second,
-- additive PERMISSIVE policy scoped by company ownership - it only widens
-- access for company owners, and doesn't touch the existing self-access
-- policy other inspectors rely on.
--
-- Run in the Supabase SQL Editor.

drop policy if exists "Company owners manage company inspections" on public.inspections;

create policy "Company owners manage company inspections"
  on public.inspections
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.company_users owner_row
      where owner_row.user_id = auth.uid()
        and owner_row.role = 'owner'
        and owner_row.company_id = inspections.company_id
    )
  )
  with check (
    exists (
      select 1
      from public.company_users owner_row
      where owner_row.user_id = auth.uid()
        and owner_row.role = 'owner'
        and owner_row.company_id = inspections.company_id
    )
  );
