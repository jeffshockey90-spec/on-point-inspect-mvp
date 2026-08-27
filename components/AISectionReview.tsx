"use client";

import { memo, useEffect, useMemo, useState } from "react";

type Props = {
  inspectionId: string;
  section: string;
  findings?: any[];
};

type ReviewItem = {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
};

const SECTION_EXPECTATIONS: Record<string, ReviewItem[]> = {
  Exterior: [
    {
      id: "exterior-grading-drainage",
      title: "Grading / drainage reviewed",
      detail: "Confirm visible grading, drainage, gutters, downspouts, vegetation clearance, and water management were reviewed where visible.",
      severity: "warning",
    },
    {
      id: "exterior-decks-rails",
      title: "Decks, stairs, rails, and porches checked",
      detail: "Verify exterior walking surfaces, steps, handrails, guardrails, porches, decks, balconies, and attachment points were documented as needed.",
      severity: "info",
    },
    {
      id: "exterior-photos",
      title: "Exterior overview photos documented",
      detail: "Add reference photos or findings photos if exterior conditions need visual support.",
      severity: "info",
    },
  ],
  Roof: [
    {
      id: "roof-covering",
      title: "Roof covering documented",
      detail: "Confirm roof covering, visible wear, penetrations, valleys, flashings, vents, and drainage were reviewed.",
      severity: "warning",
    },
    {
      id: "roof-flashing",
      title: "Flashing / penetration review",
      detail: "Look for missing, damaged, lifted, or poorly sealed flashing at walls, chimneys, skylights, vents, and valleys.",
      severity: "warning",
    },
    {
      id: "roof-access-limitation",
      title: "Roof access or visibility limitation added if needed",
      detail: "If the roof was not walked, was wet, snow covered, steep, high, or partially hidden, add a limitation.",
      severity: "warning",
    },
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    {
      id: "structure-foundation",
      title: "Foundation and structural components reviewed",
      detail: "Confirm visible foundation walls, piers, beams, joists, columns, settlement indicators, and structural limitations were documented.",
      severity: "warning",
    },
    {
      id: "structure-moisture",
      title: "Moisture / water entry indicators checked",
      detail: "Look for staining, efflorescence, active moisture, sump system conditions, damaged vapor barrier, and drainage concerns.",
      severity: "warning",
    },
    {
      id: "structure-access",
      title: "Crawlspace / basement access limitation added if needed",
      detail: "If access, clearance, stored items, insulation, or unsafe conditions limited visibility, add a limitation.",
      severity: "warning",
    },
  ],
  Heating: [
    {
      id: "heating-equipment",
      title: "Heating equipment documented",
      detail: "Confirm furnace, boiler, heat pump, distribution system, flue/venting, filters, and visible data plate were documented when present.",
      severity: "warning",
    },
    {
      id: "heating-operation",
      title: "Heating operation / limitation confirmed",
      detail: "Document whether the system was operated or why it was not operated.",
      severity: "warning",
    },
  ],
  Cooling: [
    {
      id: "cooling-equipment",
      title: "Cooling equipment documented",
      detail: "Confirm condenser/air handler, visible data plate, refrigerant line insulation, temperature limitations, and operation status were documented.",
      severity: "warning",
    },
    {
      id: "cooling-temp-limitation",
      title: "Cooling temperature limitation added if needed",
      detail: "If outdoor temperature or operating conditions limited testing, add the limitation.",
      severity: "info",
    },
  ],
  Plumbing: [
    {
      id: "plumbing-supply-drain",
      title: "Visible supply and drain piping reviewed",
      detail: "Confirm visible leaks, corrosion, water pressure concerns, drain performance, fixtures, and shutoffs were reviewed.",
      severity: "warning",
    },
    {
      id: "plumbing-water-heater",
      title: "Water heater / TPR reviewed",
      detail: "Check water heater condition, data plate, combustion/venting where applicable, TPR valve, and discharge piping.",
      severity: "warning",
    },
  ],
  Electrical: [
    {
      id: "electrical-panel",
      title: "Panel and breakers documented",
      detail: "Confirm the electrical panel, breakers, main disconnect, visible wiring, cover condition, labeling, and possible overheating/corrosion were reviewed.",
      severity: "critical",
    },
    {
      id: "electrical-label",
      title: "Panel label / data plate photo",
      detail: "Add or verify a panel label photo when accessible so service details can be documented.",
      severity: "warning",
    },
    {
      id: "electrical-gfci-afci",
      title: "GFCI / AFCI / receptacle safety checked",
      detail: "Confirm wet-area GFCI, visible AFCI/GFCI protection, smoke/CO notes, and accessible receptacle observations were documented as needed.",
      severity: "warning",
    },
  ],
  Fireplace: [
    {
      id: "fireplace-visible",
      title: "Fireplace and chimney visible components reviewed",
      detail: "Confirm visible firebox, hearth, damper, flue/chimney limitations, and operation limitations were documented.",
      severity: "info",
    },
  ],
  "Attic, Insulation & Ventilation": [
    {
      id: "attic-access",
      title: "Attic access / limitation documented",
      detail: "Confirm attic access, visibility, insulation depth/type, ventilation, roof sheathing, staining, and bath fan routing were reviewed.",
      severity: "warning",
    },
    {
      id: "attic-roof-sheathing",
      title: "Roof sheathing viewed from attic where accessible",
      detail: "If attic access was possible, confirm underside of roof sheathing and visible moisture/staining concerns were checked.",
      severity: "warning",
    },
  ],
  "Doors, Windows & Interior": [
    {
      id: "interior-safety",
      title: "Interior safety items reviewed",
      detail: "Confirm stairs, railings, guards, doors, windows, walls, ceilings, floors, and moisture staining were reviewed.",
      severity: "warning",
    },
    {
      id: "interior-egress",
      title: "Representative windows and egress checked",
      detail: "Document stuck, damaged, fogged, or unsafe windows/doors as needed.",
      severity: "info",
    },
  ],
  "Built-in Appliances": [
    {
      id: "appliances-operation",
      title: "Built-in appliances checked",
      detail: "Confirm dishwasher, range/oven, microwave, disposal, and other built-in appliances were operated or limitations were documented.",
      severity: "info",
    },
  ],
  Garage: [
    {
      id: "garage-door-safety",
      title: "Garage door safety reviewed",
      detail: "Confirm opener, photo eyes, auto-reverse, spring/cable condition, and door operation were checked or limitation was added.",
      severity: "warning",
    },
    {
      id: "garage-fire-separation",
      title: "Garage fire separation reviewed",
      detail: "Confirm visible garage-to-living-space separation, door condition, ceiling/wall penetrations, and gas appliance impact areas were reviewed.",
      severity: "warning",
    },
  ],
};

function clean(value: any) {
  return String(value || "").trim();
}

function textForFindings(findings: any[]) {
  return (findings || [])
    .map((finding: any) =>
      [
        finding?.title,
        finding?.finding_title,
        finding?.defect_title,
        finding?.observation,
        finding?.implication,
        finding?.recommendation,
        finding?.comment,
        finding?.severity,
        finding?.section,
      ]
        .map(clean)
        .filter(Boolean)
        .join(" "),
    )
    .join(" ")
    .toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function getFindingPhotoCount(findings: any[]) {
  return (findings || []).reduce((sum: number, finding: any) => {
    const photos = Array.isArray(finding?.photos) ? finding.photos : [];
    const legacyImage =
      finding?.signed_image_url ||
      finding?.image_url ||
      finding?.public_image_url ||
      "";
    return sum + photos.length + (legacyImage ? 1 : 0);
  }, 0);
}

function getCompletionStorageKey(inspectionId: string) {
  return `opi-ai-section-review-complete-${inspectionId}`;
}

function getSectionSignal(section: string, text: string, photoCount: number) {
  const base = {
    hasFindings: Boolean(text.trim()),
    hasPhotos: photoCount > 0,
    hasLimitationLanguage: hasAny(text, [
      "limited",
      "limitation",
      "inaccessible",
      "not accessible",
      "unable to access",
      "blocked",
      "stored items",
      "not visible",
      "not inspected",
      "snow",
      "unsafe access",
      "utilities off",
      "not operated",
    ]),
  };

  const checks: Record<string, boolean> = {
    documentation: base.hasFindings || base.hasPhotos,
    limitations: base.hasLimitationLanguage,
    photos: base.hasPhotos,
  };

  if (section === "Electrical") {
    checks.panel = hasAny(text, ["panel", "breaker", "service", "disconnect", "double tap", "double tapped", "wire"]);
    checks.label = hasAny(text, ["label", "data plate", "manufacturer", "panel schedule", "service size"]);
    checks.gfci = hasAny(text, ["gfci", "afci", "receptacle", "outlet", "smoke", "co detector", "carbon monoxide"]);
  }

  if (section === "Roof") {
    checks.roofCovering = hasAny(text, ["roof", "shingle", "covering", "flashing", "valley", "vent", "chimney", "boot"]);
    checks.flashing = hasAny(text, ["flashing", "chimney", "valley", "penetration", "vent boot", "wall intersection"]);
    checks.access = base.hasLimitationLanguage || hasAny(text, ["walked", "drone", "ladder", "viewed from"]);
  }

  if (section === "Heating") {
    checks.equipment = hasAny(text, ["furnace", "boiler", "heat pump", "air handler", "heater", "flue", "filter"]);
    checks.operation = hasAny(text, ["operated", "not operated", "tested", "functioning", "service", "temperature"]);
  }

  if (section === "Cooling") {
    checks.equipment = hasAny(text, ["condenser", "air conditioner", "cooling", "heat pump", "refrigerant", "air handler"]);
    checks.temperature = hasAny(text, ["temperature", "not operated", "operated", "too cold", "ambient"]);
  }

  if (section === "Plumbing") {
    checks.piping = hasAny(text, ["pipe", "supply", "drain", "leak", "corrosion", "fixture", "shutoff", "water pressure"]);
    checks.waterHeater = hasAny(text, ["water heater", "tpr", "temperature pressure", "discharge", "expansion tank"]);
  }

  if (section === "Garage") {
    checks.doorSafety = hasAny(text, ["auto reverse", "photo eye", "opener", "garage door", "spring", "cable"]);
    checks.fireSeparation = hasAny(text, ["fire", "separation", "drywall", "penetration", "garage ceiling", "self closing"]);
  }

  if (section === "Attic, Insulation & Ventilation") {
    checks.access = base.hasLimitationLanguage || hasAny(text, ["attic", "access", "insulation", "ventilation"]);
    checks.sheathing = hasAny(text, ["sheathing", "roof deck", "staining", "bath fan", "vent", "moisture"]);
  }

  return checks;
}

function shouldShowItem(section: string, item: ReviewItem, signals: Record<string, boolean>) {
  if (section === "Inspection Details") return false;

  const id = item.id;

  if (id.includes("photos")) return !signals.photos;
  if (id.includes("limitation") || id.includes("access")) return !signals.limitations;
  if (id.includes("electrical-panel")) return !signals.panel;
  if (id.includes("electrical-label")) return !signals.label;
  if (id.includes("electrical-gfci")) return !signals.gfci;
  if (id.includes("roof-covering")) return !signals.roofCovering;
  if (id.includes("flashing")) return !signals.flashing;
  if (id.includes("heating-equipment") || id.includes("cooling-equipment")) return !signals.equipment;
  if (id.includes("operation") || id.includes("temp")) return !signals.operation && !signals.temperature;
  if (id.includes("plumbing-supply")) return !signals.piping;
  if (id.includes("water-heater") || id.includes("tpr")) return !signals.waterHeater;
  if (id.includes("garage-door")) return !signals.doorSafety;
  if (id.includes("fire-separation")) return !signals.fireSeparation;
  if (id.includes("sheathing")) return !signals.sheathing;

  return !signals.documentation;
}

function AISectionReview({
  inspectionId,
  section,
  findings = [],
}: Props) {
  const [completedSections, setCompletedSections] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !inspectionId) return;

    try {
      const raw = window.localStorage.getItem(getCompletionStorageKey(inspectionId));
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") {
        setCompletedSections(parsed);
      }
    } catch {
      setCompletedSections({});
    }
  }, [inspectionId]);

  const sectionFingerprint = useMemo(() => {
    const ids = (findings || [])
      .map((finding: any) => `${finding?.id || ""}:${finding?.updated_at || finding?.created_at || ""}`)
      .join("|");
    return `${section}:${ids}:${getFindingPhotoCount(findings)}`;
  }, [findings, section]);

  useEffect(() => {
    if (typeof window === "undefined" || !inspectionId || !section) return;

    const key = `${getCompletionStorageKey(inspectionId)}-fingerprints`;
    try {
      const raw = window.localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : {};
      const prior = String(saved?.[section] || "");

      if (completedSections[section] && prior && prior !== sectionFingerprint) {
        setCompletedSections((current) => {
          const next = { ...current, [section]: false };
          window.localStorage.setItem(
            getCompletionStorageKey(inspectionId),
            JSON.stringify(next),
          );
          return next;
        });
      }
    } catch {}
  }, [completedSections, inspectionId, section, sectionFingerprint]);

  const review = useMemo(() => {
    const text = textForFindings(findings);
    const photoCount = getFindingPhotoCount(findings);
    const expectations = SECTION_EXPECTATIONS[section] || [];
    const signals = getSectionSignal(section, text, photoCount);
    const missing = expectations.filter((item) =>
      shouldShowItem(section, item, signals),
    );

    const completedCount = Math.max(0, expectations.length - missing.length);
    const score =
      expectations.length === 0
        ? 100
        : Math.round((completedCount / expectations.length) * 100);

    const hasFindings = (findings || []).length > 0;

    const completed: string[] = [];
    if (hasFindings) completed.push("Findings documented");
    if (photoCount > 0) completed.push(`${photoCount} media item${photoCount === 1 ? "" : "s"} attached`);
    if (signals.limitations) completed.push("Limitation language detected");
    if (!hasFindings && photoCount === 0) completed.push("No reportable findings documented in this section yet");

    return {
      score,
      missing,
      completed,
      photoCount,
      hasFindings,
      signals,
    };
  }, [findings, section]);

  if (section === "Inspection Details") return null;

  const isComplete = Boolean(completedSections[section]);
  const hasWarnings = review.missing.some((item) => item.severity !== "info");
  const borderClass = isComplete
    ? "border-emerald-500/50 bg-emerald-500/10"
    : hasWarnings
      ? "border-yellow-500/50 bg-yellow-500/10"
      : "border-cyan-500/40 bg-cyan-500/10";

  function markComplete() {
    const next = {
      ...completedSections,
      [section]: true,
    };

    setCompletedSections(next);
    setDismissed(false);

    try {
      window.localStorage.setItem(
        getCompletionStorageKey(inspectionId),
        JSON.stringify(next),
      );

      const fingerprintKey = `${getCompletionStorageKey(inspectionId)}-fingerprints`;
      const raw = window.localStorage.getItem(fingerprintKey);
      const fingerprints = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(
        fingerprintKey,
        JSON.stringify({
          ...fingerprints,
          [section]: sectionFingerprint,
        }),
      );
    } catch {}
  }

  function reopenReview() {
    const next = {
      ...completedSections,
      [section]: false,
    };

    setCompletedSections(next);

    try {
      window.localStorage.setItem(
        getCompletionStorageKey(inspectionId),
        JSON.stringify(next),
      );
    } catch {}
  }

  if (isComplete) {
    return (
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4 text-emerald-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              AI Section Review
            </p>
            <h3 className="mt-1 text-lg font-semibold">✅ {section} marked complete</h3>
            <p className="mt-1 text-sm text-emerald-50/80">
              AI Second Inspector will treat this section as reviewed. You can reopen the review if you add more findings.
            </p>
          </div>

          <button
            type="button"
            onClick={reopenReview}
            className="rounded-xl border border-emerald-400/70 px-4 py-2 text-sm font-semibold text-emerald-100 transition active:scale-[0.98] hover:bg-emerald-400 hover:text-black"
          >
            Reopen Review
          </button>
        </div>
      </div>
    );
  }

  if (dismissed) {
    return (
      <div className="rounded-xl border border-[#232b38] bg-[#071224] p-4">
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
        >
          🤖 Show AI Section Review for {section}
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 text-white ${borderClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            AI Section Review
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            🤖 {section} Review — {review.score}% Complete
          </h3>
          <p className="mt-1 text-sm text-[#e8ecf3]">
            End-of-section coaching. Nothing is saved automatically; this only reminds the inspector what to verify before leaving.
          </p>
        </div>

        <span className="rounded-full border border-[#59626f] bg-black/30 px-3 py-1 text-xs font-semibold text-[#e8ecf3]">
          {review.missing.length} check{review.missing.length === 1 ? "" : "s"}
        </span>
      </div>

      {review.completed.length > 0 && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Documented
          </p>
          <div className="space-y-1 text-sm font-bold text-emerald-100">
            {review.completed.slice(0, 4).map((item) => (
              <p key={item}>✅ {item}</p>
            ))}
          </div>
        </div>
      )}

      {review.missing.length > 0 ? (
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-black/25 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">
            Check Before Leaving
          </p>
          <div className="space-y-3">
            {review.missing.map((item) => (
              <div key={item.id} className="rounded-lg border border-[#232b38] bg-[#131923] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-yellow-100">⚠ {item.title}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      item.severity === "critical"
                        ? "border-red-400/60 text-red-200"
                        : item.severity === "warning"
                          ? "border-yellow-400/60 text-yellow-200"
                          : "border-cyan-400/60 text-cyan-200"
                    }`}
                  >
                    {item.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-[#8a93a3]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">
          ✅ AI does not see any major missing documentation signals for this section based on current findings and media.
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-xl border border-[#59626f] px-4 py-2 text-sm font-semibold text-[#e8ecf3] transition active:scale-[0.98] hover:bg-[#1a212c]"
        >
          Continue Inspecting
        </button>

        <button
          type="button"
          onClick={() => {
            const target = document.querySelector(`[data-section-limitations="${CSS.escape(section)}"]`);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
          className="rounded-xl border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-200 transition active:scale-[0.98] hover:bg-orange-500 hover:text-black"
        >
          Add Limitation If Needed
        </button>

        <button
          type="button"
          onClick={markComplete}
          className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition active:scale-[0.98] hover:bg-emerald-300"
        >
          Complete Section
        </button>
      </div>
    </div>
  );
}

export default memo(AISectionReview);
