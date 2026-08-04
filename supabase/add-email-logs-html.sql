-- Store the exact rendered HTML of each sent email so the Sent Emails view can
-- show precisely what the client received. Run once in the Supabase SQL Editor.
alter table public.email_logs add column if not exists html text;
