export type DefectRecord = {
  id: string;
  category: string;
  title: string;
  aliases: string[];
  defaultSeverity:
    | "Monitor"
    | "Maintenance"
    | "Recommended Repair"
    | "Safety Concern"
    | "Major Concern";
  commonCauses: string[];
  risks: string[];
  recommendation: string;
  inspectorTips: string[];
};

const DEFECTS: DefectRecord[] = [
  {
    id: "roof-missing-shingles",
    category: "Roof",
    title: "Missing or Damaged Shingles",
    aliases: ["missing shingles","damaged shingles","roof damage"],
    defaultSeverity: "Recommended Repair",
    commonCauses: ["Wind","Aging","Storm damage"],
    risks: ["Water intrusion","Reduced roof life"],
    recommendation: "Recommend repair or replacement of damaged roofing materials by a qualified roofing contractor.",
    inspectorTips: ["Check adjacent shingles.","Inspect flashing and underlayment if accessible."]
  },
  {
    id: "elec-double-tap",
    category: "Electrical",
    title: "Double-Tapped Breaker",
    aliases: ["double tap","double lugged breaker"],
    defaultSeverity: "Safety Concern",
    commonCauses: ["Improper installation","Circuit additions"],
    risks: ["Loose connection","Overheating","Fire hazard"],
    recommendation: "Recommend evaluation and correction by a qualified electrical contractor.",
    inspectorTips: ["Verify breaker listing.","Photograph breaker label."]
  },
  {
    id: "plumb-active-leak",
    category: "Plumbing",
    title: "Active Plumbing Leak",
    aliases: ["water leak","active leak"],
    defaultSeverity: "Recommended Repair",
    commonCauses: ["Failed fitting","Corrosion","Loose connection"],
    risks: ["Water damage","Mold growth"],
    recommendation: "Recommend repair by a qualified plumbing contractor.",
    inspectorTips: ["Document moisture staining.","Identify source if visible."]
  },
  {
    id: "foundation-horizontal-crack",
    category: "Basement, Foundation, Crawlspace & Structure",
    title: "Horizontal Foundation Crack",
    aliases: ["horizontal crack","foundation wall crack"],
    defaultSeverity: "Major Concern",
    commonCauses: ["Lateral soil pressure","Settlement"],
    risks: ["Structural movement","Water intrusion"],
    recommendation: "Recommend evaluation by a qualified structural professional.",
    inspectorTips: ["Measure crack width.","Look for displacement or bowing."]
  }
];

export class DefectDatabase {
  all() {
    return DEFECTS;
  }

  find(text?: string) {
    const q = String(text || "").toLowerCase().trim();
    if (!q) return null;

    return (
      DEFECTS.find(
        d =>
          d.title.toLowerCase() === q ||
          d.aliases.some(a => q.includes(a))
      ) || null
    );
  }

  byCategory(category: string) {
    return DEFECTS.filter(d => d.category === category);
  }
}

export const defectDatabase = new DefectDatabase();
