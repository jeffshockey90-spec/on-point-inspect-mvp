-- =====================================================================
-- The inspector "learning brain" table. The app already POSTs AI-draft-vs-
-- inspector-final diffs to /api/ai/learning (LearningEngine.record), but this
-- table was never created -- so every correction was silently discarded. This
-- creates it AND adds inspector scoping so the memory is per-inspector, not
-- global across all inspectors.
-- =====================================================================
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

create table if not exists public.ai_learning_events (
  id              uuid primary key default gen_random_uuid(),
  inspector_id    uuid,               -- who this lesson belongs to (scoping)
  inspection_id   bigint,
  tool            text,               -- e.g. editable_finding, ai_capture
  ai_prediction   jsonb,              -- the AI draft
  inspector_result jsonb,             -- the inspector's final version
  changed_fields  text[],
  changes         jsonb,
  accepted        boolean,
  confidence      numeric,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists ai_learning_events_inspector_idx
  on public.ai_learning_events (inspector_id, created_at desc);

alter table public.ai_learning_events enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='ai_learning_events'
  loop execute format('drop policy if exists %I on public.ai_learning_events', p.policyname); end loop;
end $$;

-- The learning engine reads/writes with the inspector's own session, so RLS
-- both scopes reads to their own rows and gates inserts to their own id.
create policy ai_learning_read on public.ai_learning_events
  for select to authenticated
  using (inspector_id = auth.uid() or public.is_platform_owner());
create policy ai_learning_insert on public.ai_learning_events
  for insert to authenticated
  with check (inspector_id = auth.uid() or inspector_id is null);
