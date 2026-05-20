-- On Point Inspect MVP Database Schema
-- Run this in Supabase SQL Editor, then create a public storage bucket named: inspection-photos

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists realtors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  brokerage text,
  email text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  realtor_id uuid references realtors(id),
  property_address text not null,
  square_feet integer,
  inspection_date date,
  inspection_type text default 'Standard Home Inspection',
  status text default 'draft',
  agreement_status text default 'not_sent',
  payment_status text default 'unpaid',
  base_price numeric default 500,
  travel_fee numeric default 0,
  discount numeric default 0,
  total_price numeric,
  notes text,
  created_at timestamptz default now()
);

create table if not exists inspection_sections (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id) on delete cascade,
  name text not null,
  sort_order integer default 0
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id) on delete cascade,
  section_name text not null,
  title text not null,
  observation text,
  implication text,
  recommendation text,
  severity text default 'recommendation',
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references findings(id) on delete cascade,
  inspection_id uuid references inspections(id) on delete cascade,
  storage_path text not null,
  public_url text,
  caption text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  observation text,
  implication text,
  recommendation text,
  default_severity text default 'recommendation',
  created_at timestamptz default now()
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  created_at timestamptz default now()
);

-- Helpful indexes for speed
create index if not exists findings_inspection_id_idx on findings(inspection_id);
create index if not exists photos_finding_id_idx on photos(finding_id);
create index if not exists photos_inspection_id_idx on photos(inspection_id);
create index if not exists inspections_created_at_idx on inspections(created_at desc);

insert into templates (category, title, observation, implication, recommendation, default_severity)
values
('Electrical', 'Missing GFCI Protection', 'One or more receptacles appeared to lack GFCI protection at the time of inspection.', 'This may increase the risk of electrical shock in areas where moisture may be present.', 'Recommend evaluation and correction by a qualified electrician as needed.', 'safety'),
('Electrical', 'Improper Open Air Splice', 'One or more electrical conductor splices appeared to be present outside of an approved junction box/enclosure.', 'Improperly protected electrical connections may present a shock or fire safety concern.', 'Recommend further evaluation and correction by a qualified electrician.', 'safety'),
('General Information', 'Older Home Materials Disclaimer', 'The home was built during a time when materials such as lead-based paint and asbestos-containing materials may have been commonly used.', 'The presence of these materials cannot be confirmed without laboratory testing.', 'Recommend further evaluation/testing by a qualified specialist if confirmation is desired.', 'client-info'),
('Exterior/Roof', 'Snow / Limited Visibility', 'Snow cover limited visibility of some exterior and/or roof components at the time of inspection.', 'Some defects may not be visible when components are concealed.', 'Recommend further evaluation when conditions allow if concerns are present.', 'client-info'),
('Plumbing', 'Missing Sink Stopper', 'The sink stopper was missing or not functioning as intended at the time of inspection.', 'This may reduce normal use of the sink drain assembly.', 'Recommend repair or replacement as desired.', 'recommendation'),
('HVAC', 'Typical Service Life Notice', 'The visible HVAC equipment appeared to be within or beyond typical service life expectations based on available information.', 'Older equipment may be more prone to repairs or reduced efficiency.', 'Recommend regular servicing by a qualified HVAC contractor and budgeting for future replacement as needed.', 'client-info')
on conflict do nothing;



-- AI photo/comment assist fields
alter table photos add column if not exists ai_section_suggestion text;
alter table photos add column if not exists ai_defect_summary text;
alter table photos add column if not exists ai_confidence numeric;
alter table photos add column if not exists ai_review_status text default 'pending_review';

create table if not exists ai_comment_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tone text default 'professional, clear, realtor-friendly, non-alarmist',
  default_recommendation text default 'Recommend further evaluation and correction by a qualified professional as needed.',
  created_at timestamptz default now()
);

create table if not exists ai_photo_reviews (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  inspection_id uuid references inspections(id) on delete cascade,
  finding_id uuid references findings(id) on delete cascade,
  suggested_section text,
  suggested_title text,
  observation text,
  implication text,
  recommendation text,
  severity text,
  confidence numeric,
  raw_response jsonb,
  created_at timestamptz default now()
);

insert into ai_comment_presets (name, tone, default_recommendation)
values ('On Point Default', 'Professional, clear, concise, realtor-friendly, non-alarmist, using Observation / Implication / Recommendation format.', 'Recommend further evaluation and correction by a qualified professional as needed.')
on conflict do nothing;

-- Basic demo-friendly access. For a real paid app, enable Supabase Auth + row level security policies.
-- Storage setup: create public bucket named inspection-photos in Supabase Dashboard > Storage.
