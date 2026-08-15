-- Per-service price map for an inspection, so any service (not just
-- home/radon/mold) can carry its own price and each agreement's
-- {{INSPECTION_FEE}} shows that service's fee.
--
-- Shape: { "<canonical_service_key>": <amount>, ... }
--   e.g. { "home_inspection": 400, "radon": 175, "mold": 265, "sewer_scope": 150 }
-- Keys are canonicalized (lowercase, non-alphanumerics -> "_") from the service
-- type so they line up with agreement template service types.
alter table inspections
  add column if not exists service_fees jsonb not null default '{}'::jsonb;
