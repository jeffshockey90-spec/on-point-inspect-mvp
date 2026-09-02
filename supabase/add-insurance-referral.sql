-- Optional, PER-INSPECTOR insurance-agent referral shown in the client portal.
-- Each inspector enters THEIR OWN agent (name/company/phone/email/link/blurb)
-- and turns it on themselves — it never appears for another inspector or
-- company unless they set up their own. Default OFF (opt-in). A client only
-- ever reaches the agent (link) or has their info sent after ticking consent
-- and tapping the button in the portal. Idempotent; run once in Supabase SQL.

create table if not exists public.insurance_referral_settings (
  user_id       uuid primary key,
  user_email    text,
  enabled       boolean not null default false,
  agent_name    text,
  agent_company text,
  agent_phone   text,
  agent_email   text,
  agent_link    text,
  blurb         text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.insurance_referral_leads (
  id               uuid primary key default gen_random_uuid(),
  inspection_id    bigint,
  inspector_id     uuid,
  client_name      text,
  client_email     text,
  client_phone     text,
  property_address text,
  agent_email      text,
  consent_text     text,
  status           text not null default 'pending', -- pending | submitted | error
  result_message   text,
  created_at       timestamptz not null default now()
);

create index if not exists insurance_referral_leads_inspection_idx
  on public.insurance_referral_leads (inspection_id);
create index if not exists insurance_referral_leads_inspector_idx
  on public.insurance_referral_leads (inspector_id);

-- Server routes use the service-role key (bypasses RLS); enable RLS so nothing
-- is exposed to the anon/authenticated client directly. An inspector may read
-- their own settings row / leads if we ever query as them.
alter table public.insurance_referral_settings enable row level security;
alter table public.insurance_referral_leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'insurance_referral_settings'
      and policyname = 'own insurance settings'
  ) then
    create policy "own insurance settings" on public.insurance_referral_settings
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'insurance_referral_leads'
      and policyname = 'own insurance leads'
  ) then
    create policy "own insurance leads" on public.insurance_referral_leads
      for select using (auth.uid() = inspector_id);
  end if;
end $$;
