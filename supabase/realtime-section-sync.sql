-- Live cross-device sync for more of the report builder: checklist boxes,
-- limitations, reference photos and equipment (findings were already live,
-- see realtime-report-sync.sql). Adds these tables to the Supabase Realtime
-- publication. Realtime respects RLS, so each device only receives rows it is
-- allowed to read. Idempotent; run once in the SQL editor.

do $$
declare
  t text;
begin
  foreach t in array array['section_checklist_selections', 'section_limitations', 'section_reference_photos', 'equipment_inventory']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
