-- Manual ordering of a section's reference-gallery photos (the ↑/↓ reorder
-- controls). NULL = unordered (legacy), falls back to created_at. Mirrors
-- photos.sort_order.
ALTER TABLE public.section_reference_photos
  ADD COLUMN IF NOT EXISTS sort_order integer;
