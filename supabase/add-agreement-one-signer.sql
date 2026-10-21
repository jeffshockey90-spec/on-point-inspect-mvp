-- "One signature covers all clients" — when an inspection has two or more
-- clients (e.g. a couple buying the same property), the inspector can choose to
-- let ANY one of them signing the agreement satisfy it for all of them, instead
-- of chasing every client's signature. Off by default (every required client
-- still signs), so this never makes the gate looser than intended.
--
-- Read by lib/reportDelivery.ts (isAgreementComplete) and set from the
-- Agreement panel via /api/agreement-waiver (action "one_signer").
--
-- Run in the Supabase SQL Editor.

alter table inspections
  add column if not exists agreement_one_signer boolean not null default false;
