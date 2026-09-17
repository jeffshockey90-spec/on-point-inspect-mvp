-- Priority Repairs summary: an optional, AI-ranked ordering of a report's
-- findings that the inspector can generate in the report builder and optionally
-- show on the client's report.
--
-- priority_summary shape:
--   { "generatedAt": "<iso>", "items": [ { "findingId": "<id>", "reason": "<one-line>" } ] }
-- Order in the array IS the priority order (rank 1 first). `reason` is a short,
-- cautious "why this is a priority" line.
--
-- priority_summary_visible gates whether it renders on client-facing reports
-- (share / client portal / PDF / print). Default OFF — opt-in per report.

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS priority_summary jsonb,
  ADD COLUMN IF NOT EXISTS priority_summary_visible boolean NOT NULL DEFAULT false;
