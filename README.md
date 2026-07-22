# FLOW MVP

A starter web app for On Point Home Inspections LLC. This is designed as a phone-friendly inspection workflow app, not a full Spectora replacement yet.

## Current features

- Dashboard for recent inspections
- New inspection setup
- Client and realtor records
- Quote calculator
- Report builder
- Observation / Implication / Recommendation findings
- Severity labels: Client Info, Recommendation, Safety Concern, Major Concern
- Finding status: Open, Monitor, Repaired/Addressed
- Template library
- Photo upload per finding using Supabase Storage
- Printable report view / Save as PDF through browser print

## Tech stack

- Next.js
- React
- Tailwind CSS
- Supabase database
- Supabase Storage for photos

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project.

3. Open Supabase SQL Editor and run:

```text
supabase/schema.sql
```

4. In Supabase Storage, create a public bucket named:

```text
inspection-photos
```

5. Copy `.env.example` to `.env.local` and add your Supabase keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

6. Run the app:

```bash
npm run dev
```

7. Open:

```text
http://localhost:3000
```

## Important notes

This MVP uses simple public/demo-friendly Supabase access so you can test the workflow quickly. Before using it with real client data, add Supabase Auth, row-level security policies, backups, and production hosting security.

## Suggested next build steps

1. Add login for Jeff/admin only.
2. Add report logo upload and branding controls.
3. Add agreements and e-signature tracking.
4. Add payment tracking or Stripe checkout.
5. Add radon, mold, and water-testing modules.
6. Add shareable client report links.

## AI Assist Upgrade

This version adds an AI layer for inspection reporting:

- AI Comment Assist inside the Report Builder
- AI Photo Review for existing finding photos
- AI Capture page that lets you take/upload a defect photo and automatically creates a finding in the suggested report section
- Human review step before publishing; AI output should be verified by the inspector

### Required AI Setup

Add this to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key
```

Then install dependencies and run the app:

```bash
npm install
npm run dev
```

### Supabase Storage Requirement

Create a public Supabase Storage bucket named:

```text
inspection-photos
```

The AI photo review uses the public image URL so the image can be evaluated.

### Important Inspection Disclaimer

AI-generated comments and photo evaluations are drafting tools only. The inspector must verify the defect, section placement, severity, and wording before the report is published.
