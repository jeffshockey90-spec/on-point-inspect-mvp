-- Legal-defensibility fields for a signed agreement: a tamper-evidence hash of
-- the exact signed text, when the signer first viewed the agreement, and their
-- explicit electronic-signature (ESIGN/UETA) consent. All are written
-- best-effort after the signature is recorded, so a not-yet-run migration can
-- never block a client from signing.

alter table inspection_agreements
  add column if not exists agreement_hash text,
  add column if not exists viewed_at timestamptz,
  add column if not exists esign_consent boolean not null default false,
  add column if not exists esign_consent_text text;
