-- email_logs.message is NOT NULL at the database level, but several send
-- routes (W9, repair request, report email, review request) never set it -
-- they were built after the column was added and rely on `metadata` for
-- detail instead. Every one of those sends has been silently failing to
-- write its email_logs row (the email itself still sends fine via Resend -
-- only the "Sent Emails" tracking entry was lost), because the insert
-- violates this constraint and the route's own try/catch swallows the
-- error. Dropping the constraint matches how the column is actually used
-- across the app today: optional, not consistently populated.

alter table public.email_logs
  alter column message drop not null;
