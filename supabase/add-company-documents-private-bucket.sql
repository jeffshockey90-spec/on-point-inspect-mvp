-- The W9 (and any other real business document containing SSN/EIN) was
-- being stored in the `company-assets` bucket, which is PUBLIC - the same
-- bucket used for logo images. A completed W9 contains a real taxpayer ID,
-- so it should never sit behind a guessable/public URL. This creates a
-- dedicated PRIVATE bucket for these documents and moves the app code
-- (CompanyDocumentUploader, /api/send-w9, /api/company/w9/fill) onto it.
--
-- Run in the Supabase SQL Editor. This only adds a new bucket/policy - it
-- does not touch company-assets or anything already uploaded there.

insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

drop policy if exists "Company members manage own company documents" on storage.objects;

create policy "Company members manage own company documents"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'company-documents'
    and exists (
      select 1
      from public.company_users
      where company_users.user_id = auth.uid()
        and company_users.company_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'company-documents'
    and exists (
      select 1
      from public.company_users
      where company_users.user_id = auth.uid()
        and company_users.company_id::text = (storage.foldername(name))[1]
    )
  );
