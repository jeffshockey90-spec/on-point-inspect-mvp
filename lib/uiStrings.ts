// Curated UI labels shown across the client-facing report and portals. These
// are the fixed "chrome" strings (buttons, tabs, headers, chips) — NOT the
// inspection content, which is translated in the data. Translated once per
// language and cached globally (see getUiTranslations), then applied by
// components/UiAutoTranslate by exact full-text match, so nothing else on the
// page is touched. Client-safe (plain array).

export const REPORT_UI_STRINGS: string[] = [
  // Top actions
  "Export PDF",
  "Download Report",
  "Download PDF",
  "Home Maintenance Hub",
  "View Summary",
  "View Full Findings",
  "View Finding",
  "Client Portal",
  "Full Editable Report",
  "Open the full report",
  "Print / Save PDF",
  "Repair Request",
  "View Report",
  // Overview / totals
  "Report Ready",
  "Inspection Overview",
  "Total Defects",
  "Safety / Major",
  "Recommended Repair",
  "Maintenance / Monitor",
  "Informational",
  "Click to filter",
  "Click a defect type above to filter the findings list.",
  // Tabs / sections
  "Summary",
  "Full Report",
  "Standards",
  "Equipment",
  "Safety Hazards",
  "Recommendations",
  "Maintenance",
  "Limitations",
  "Client Summary",
  "Key Findings Summary",
  "Safety / Major Concerns",
  // Severity chips
  "Safety Concern",
  "Major Concern",
  "Monitor",
  // Finding fields
  "Observation",
  "Implication",
  "Recommendation",
  "Location",
  // Portal
  "Report Actions Locked",
  "Home Maintenance",
  "Your Home",
  "Your Systems & Equipment",
  "Your Maintenance Plan",
  "Safety items to prioritize",
  "View your full inspection report",
  // Descriptive sentences on the report
  "This report includes inspection information, limitations, disclaimers, section reference photos, and documented findings. Reference photos are documentation only and are not counted as defects.",
  "This summary highlights notable findings by severity so clients and agents can quickly review the most important report items. The full report below remains the complete inspection record.",
  "Items that may involve safety, injury, fire, shock, fall, structural, or major system concerns.",
  "Click a defect type above to filter the findings list.",
];
