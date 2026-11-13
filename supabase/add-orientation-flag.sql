-- Home Orientation service: flag a job as a non-inspection "new-owner / possession
-- walkthrough" so client-facing surfaces can present it as an orientation (not a
-- defect inspection). Nullable boolean, default false, so every existing row and
-- every normal inspection is unaffected. Idempotent — safe to run more than once.
alter table public.inspections
  add column if not exists is_orientation boolean not null default false;
