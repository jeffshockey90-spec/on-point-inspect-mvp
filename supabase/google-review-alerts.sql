-- Push alerts when a company gets a new Google review.
-- The cron (/api/cron/check-google-reviews) compares the live Google
-- userRatingCount against companies.google_review_count and, when it goes up,
-- pushes the company's owner. This toggle lets each company turn it on/off.

alter table companies
  add column if not exists google_review_alerts_enabled boolean not null default true;

-- Tracks the last time the alert cron checked this company, so we can show
-- "last checked" and avoid re-alerting on the same count.
alter table companies
  add column if not exists google_review_alerts_checked_at timestamptz;
