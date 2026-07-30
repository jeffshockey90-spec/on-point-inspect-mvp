-- companies.w9_document_url only ever tracks the CURRENT W9 - every time
-- it's replaced (re-filled or re-uploaded), the old file's storage object
-- stays in the private company-documents bucket, but nothing recorded that
-- it existed. This adds a real history: one row per version ever saved,
-- so past W9s stay viewable instead of disappearing when a new one is
-- generated.
--
-- Run in the Supabase SQL Editor.

create table if not exists public.w9_documents (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.w9_documents enable row level security;

drop policy if exists "Company members manage own w9 document history" on public.w9_documents;

create policy "Company members manage own w9 document history"
  on public.w9_documents
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.company_users
      where company_users.user_id = auth.uid()
        and company_users.company_id = w9_documents.company_id
    )
  )
  with check (
    exists (
      select 1
      from public.company_users
      where company_users.user_id = auth.uid()
        and company_users.company_id = w9_documents.company_id
    )
  );
