-- =====================================================================
-- Environmental report photos (Mold now; Radon later via the same table).
--
-- Mirrors section_reference_photos but grouped by `kind` (mold|radon) instead
-- of `section`. Stored in the inspection-photos bucket, one row per photo.
-- Safe to re-run.
-- =====================================================================

create table if not exists public.environmental_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null,
  kind text not null default 'mold',          -- 'mold' | 'radon'
  caption text,
  file_path text,
  public_url text,
  thumbnail_path text,
  thumbnail_url text,
  sort_order integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_environmental_photos_inspection
  on public.environmental_photos (inspection_id, kind);

-- RLS: same model as findings/photos/section_reference_photos — an inspector
-- reads/writes only their own inspection's rows; the platform owner sees all;
-- the service-role key (used by the public share page + PDF) bypasses RLS.
-- Relies on public.owns_inspection_txt + public.is_platform_owner from
-- supabase/enable-inspection-rls.sql.
alter table public.environmental_photos enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'environmental_photos'
  loop execute format('drop policy if exists %I on public.environmental_photos', p.policyname); end loop;
end $$;
create policy environmental_photos_self_access on public.environmental_photos
  for all to authenticated
  using (public.is_platform_owner() or public.owns_inspection_txt(inspection_id::text))
  with check (public.is_platform_owner() or public.owns_inspection_txt(inspection_id::text));
