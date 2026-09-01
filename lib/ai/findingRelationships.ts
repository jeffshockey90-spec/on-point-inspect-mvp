// Cross-finding relationship detection — the first piece of the "House Graph".
// Given a report's findings, it spots pairs that likely share a physical cause
// so FLOW can offer to connect them ("the NE downspout and the NE foundation
// stain are probably one water path"). Deliberately CONSERVATIVE: it only links
// on strong, explainable signals (shared side + a known water/vertical relation)
// because a confidently-wrong link is worse than none. Location is read from a
// finding's structured `location` when present, else parsed from its text, so it
// works on new, old, and imported findings alike.

export type FindingLite = {
  id: string;
  section?: string | null;
  title?: string | null;
  observation?: string | null;
  location?: string | null;
};

export type FindingRelationship = {
  aId: string;
  bId: string;
  kind: "water-path" | "vertical";
  reason: string;
};

const SIDE_WORDS: [RegExp, string][] = [
  [/north[\s-]?east|\bne\b/, "NE"],
  [/north[\s-]?west|\bnw\b/, "NW"],
  [/south[\s-]?east|\bse\b/, "SE"],
  [/south[\s-]?west|\bsw\b/, "SW"],
  [/\bnorth\b|\bn\b(?=\s*(corner|side|wall|elevation|exterior))/, "N"],
  [/\bsouth\b|\bs\b(?=\s*(corner|side|wall|elevation|exterior))/, "S"],
  [/\beast\b|\be\b(?=\s*(corner|side|wall|elevation|exterior))/, "E"],
  [/\bwest\b|\bw\b(?=\s*(corner|side|wall|elevation|exterior))/, "W"],
];

function textOf(f: FindingLite): string {
  return `${f.location || ""} ${f.title || ""} ${f.observation || ""}`.toLowerCase();
}

export function extractSide(f: FindingLite): string | null {
  // Prefer an explicit structured location; fall back to the whole text.
  const loc = String(f.location || "").toLowerCase();
  const hay = loc || textOf(f);
  for (const [re, code] of SIDE_WORDS) if (re.test(hay)) return code;
  return null;
}

type Level = "exterior" | "roof" | "basement" | "crawlspace" | "main" | "upper" | "attic" | null;

export function extractLevel(f: FindingLite): Level {
  const t = textOf(f);
  const sec = String(f.section || "").toLowerCase();
  if (/crawl\s?space|\bcrawl\b/.test(t)) return "crawlspace";
  if (/basement|foundation|cellar|footing/.test(t) || sec.includes("basement") || sec.includes("foundation")) return "basement";
  if (/\battic\b/.test(t) || sec.includes("attic")) return "attic";
  if (/\broof\b|shingle|flashing|gutter|downspout|soffit|fascia/.test(t) || sec === "roof") return t.includes("roof") || sec === "roof" ? "roof" : "exterior";
  if (/upper|second floor|2nd floor|upstairs/.test(t)) return "upper";
  if (/exterior|outside|siding|grade|driveway|walkway|lot|drainage/.test(t) || sec === "exterior") return "exterior";
  if (/main level|first floor|1st floor|ground floor/.test(t)) return "main";
  return null;
}

// Signal helpers.
const isWaterSource = (t: string) =>
  /downspout|gutter|grade|drainage|discharge|splash block|slope|negative grade|roof drain|scupper|leader/.test(t);
const isMoistureSymptom = (t: string) =>
  /efflorescence|water stain|moisture|water intrusion|damp|seepage|wet|mold|mildew|staining|water penetration|rot\b/.test(t);
const isRoofIssue = (t: string) =>
  /roof|shingle|flashing|valley|penetration|vent boot|chimney flashing/.test(t);
const isPlumbingAbove = (t: string) =>
  /plumbing|supply line|drain line|p-trap|toilet|shower|tub|bath|sink|water line|leak/.test(t);
const isCeilingStain = (t: string) =>
  /(ceiling).*(stain|water|moisture|damp|discolor)|(stain|water|moisture|damp|discolor).*(ceiling)/.test(t);

// Returns de-duplicated relationships across the findings. O(n^2) is fine — a
// report has tens of findings, not thousands.
export function detectFindingRelationships(findings: FindingLite[]): FindingRelationship[] {
  const out: FindingRelationship[] = [];
  const seen = new Set<string>();
  const push = (aId: string, bId: string, kind: FindingRelationship["kind"], reason: string) => {
    const key = [aId, bId].sort().join("|") + kind;
    if (seen.has(key) || aId === bId) return;
    seen.add(key);
    out.push({ aId, bId, kind, reason });
  };

  for (let i = 0; i < findings.length; i += 1) {
    for (let j = i + 1; j < findings.length; j += 1) {
      const a = findings[i];
      const b = findings[j];
      const ta = textOf(a);
      const tb = textOf(b);
      const sideA = extractSide(a);
      const sideB = extractSide(b);
      const lvlA = extractLevel(a);
      const lvlB = extractLevel(b);

      // 1) WATER PATH: an exterior water source + a below-grade moisture symptom
      //    on the SAME side of the house.
      const aSource = isWaterSource(ta) && (lvlA === "exterior" || lvlA === "roof");
      const bSymptom = isMoistureSymptom(tb) && (lvlB === "basement" || lvlB === "crawlspace");
      const bSource = isWaterSource(tb) && (lvlB === "exterior" || lvlB === "roof");
      const aSymptom = isMoistureSymptom(ta) && (lvlA === "basement" || lvlA === "crawlspace");
      if (sideA && sideB && sideA === sideB) {
        if (aSource && bSymptom) {
          push(a.id, b.id, "water-path", `Both on the ${sideA} side — the exterior drainage and the below-grade moisture likely share one water path.`);
          continue;
        }
        if (bSource && aSymptom) {
          push(b.id, a.id, "water-path", `Both on the ${sideA} side — the exterior drainage and the below-grade moisture likely share one water path.`);
          continue;
        }
      }

      // 2) VERTICAL: a roof or plumbing issue above an interior ceiling stain.
      if (isCeilingStain(ta) && (isRoofIssue(tb) || isPlumbingAbove(tb))) {
        push(b.id, a.id, "vertical", `A ${isRoofIssue(tb) ? "roof" : "plumbing"} issue above a ceiling stain — possible source of the interior moisture.`);
        continue;
      }
      if (isCeilingStain(tb) && (isRoofIssue(ta) || isPlumbingAbove(ta))) {
        push(a.id, b.id, "vertical", `A ${isRoofIssue(ta) ? "roof" : "plumbing"} issue above a ceiling stain — possible source of the interior moisture.`);
        continue;
      }
    }
  }

  return out;
}
