-- Secure "Deliver anyway" override for locked reports.
--
-- The client-facing report (share link, PDF download, client portal) is now
-- gated SERVER-side: a client can only see a published report once payment and
-- required agreements are complete. This column lets an authenticated company
-- owner or the assigned inspector deliberately release a report before those
-- are satisfied (e.g. paid offline, comp job) without reopening the gate to
-- everyone. Publishing is still required; the override only skips the
-- payment/agreement requirement.
--
-- Safe to run more than once.
alter table inspections
  add column if not exists delivery_override boolean not null default false,
  add column if not exists delivery_override_by uuid,
  add column if not exists delivery_override_at timestamptz;
