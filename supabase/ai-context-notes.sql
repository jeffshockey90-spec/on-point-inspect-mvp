-- Context Layer: an inspector-authored, per-inspection context note that the
-- FLOW Writer AI uses on every finding write-up for that inspection
-- (lib/ai/inspectionContext.ts reads it). Free text, optional.
alter table public.inspections
  add column if not exists ai_context_notes text;
