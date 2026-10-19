-- Coder chat attachments (screenshots/docs Jeff attaches when asking Claude
-- to look into something) were stored in company-assets, a PUBLIC bucket
-- shared with things like the company logo. A screenshot can carry a
-- client's name, address, or payment details, so it shouldn't sit behind a
-- guessable public URL. This creates a dedicated PRIVATE bucket, scoped to
-- each owner's own folder — the same move already made for the W9 in
-- add-company-documents-private-bucket.sql.
--
-- Attachments are served via signed URLs (see
-- app/api/owner/coder/upload/route.ts) and swept out of storage after a
-- couple of weeks by app/api/cron/coder-attachments-cleanup/route.ts.
--
-- Run in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('coder-attachments', 'coder-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Owner manages own coder attachments" on storage.objects;

create policy "Owner manages own coder attachments"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'coder-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'coder-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
