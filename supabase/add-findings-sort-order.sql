-- Manual ordering of findings WITHIN a section in the report builder (the ↑/↓
-- reorder controls on each defect card). NULL = unordered (legacy/new findings),
-- which falls back to created_at order — exactly like photos.sort_order.
-- Everything that groups findings into sections should order by sort_order
-- (nulls last) then created_at.
ALTER TABLE public.findings
  ADD COLUMN IF NOT EXISTS sort_order integer;
