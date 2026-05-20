# On Point Inspect Roadmap

## Completed in current MVP scaffold

- App shell and navigation
- Dashboard
- Inspection creation
- Quote calculator
- Supabase schema
- Report builder
- Template picker
- Printable PDF workflow
- Photo uploads per finding
- Photo captions
- Finding severity and status

## Phase 2: Make it field-ready

- Real login/authentication
- User-specific data security with row-level security
- Mobile camera capture improvements
- Drag-and-drop photo ordering
- Edit existing findings
- Duplicate finding/templates quickly
- Voice-to-text note entry
- Save draft automatically

## Phase 3: Report quality

- Custom cover page with logo
- Summary page grouped by severity
- Table of contents
- Better page breaks for PDF
- Optional client-friendly wording mode
- Separate client info items from repair recommendations

## Phase 4: Business workflow

- Agreement status
- Payment status
- Stripe payment links
- Zelle/cash/check/manual payment tracking
- Realtor CRM
- Follow-up reminders
- Google review request templates

## Phase 5: Add-on services

- Radon test setup and CRM/device tracking
- Mold sample chain-of-custody tracking
- Water sample tracking
- Drone roof photo section
- Lab result attachments

## AI Assist Added

Implemented in this version:

- AI comment generation from rough inspector notes
- AI image review from report photos
- AI photo section routing suggestions
- AI Capture workflow: take/upload photo → AI suggests section → app creates finding and attaches photo
- Stores AI review history in `ai_photo_reviews`
- Adds review status fields to photos so future versions can require inspector approval before report publishing

Recommended next improvements:

- Add “approved by inspector” checkbox before export
- Add company-specific comment library learning from saved templates
- Add voice-to-finding workflow
- Add batch photo intake after an inspection
- Add confidence threshold, for example auto-route only when confidence is 80%+
- Add offline mode for crawlspaces/low-service areas
