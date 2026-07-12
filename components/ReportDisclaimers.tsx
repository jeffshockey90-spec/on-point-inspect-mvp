"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_DISCLAIMER_TOPICS = [
  "Older Home Disclaimer",
  "Environmental / Hazardous Materials",
  "Lead-Based Paint",
  "Asbestos",
  "Mold / Microbial Growth",
  "Pest / Wood Destroying Insects",
  "Code Compliance",
  "Concealed / Inaccessible Areas",
  "Snow / Weather Limitations",
  "Personal Property / Stored Items",
  "Utilities Off / Not Operated",
  "Permit / Previous Work Unknown",
  "Older Electrical System",
  "Older Plumbing Materials",
  "Aluminum Wiring",
  "Knob-and-Tube Wiring",
  "Federal Pacific / Zinsco Panels",
  "Oil Tank / Fuel Storage",
  "Vermiculite Insulation",
  "Polybutylene Plumbing",
];

const DEFAULT_TEXT: Record<string, string> = {
  "Older Home Disclaimer":
    "Due to the age of the home, older construction methods, materials, and concealed conditions may be present. The inspection was visual and non-invasive, and hidden conditions could not be fully evaluated.",
  "Environmental / Hazardous Materials":
    "Environmental hazards and hazardous materials are outside the scope of this visual home inspection unless specifically contracted for and sampled by a qualified specialist.",
  "Lead-Based Paint":
    "Homes built prior to 1978 may contain lead-based paint. No lead testing was performed as part of this inspection. Further evaluation by a qualified specialist is recommended if confirmation is desired.",
  Asbestos:
    "Some older building materials may contain asbestos. No asbestos testing was performed as part of this inspection. Confirmation requires laboratory testing by a qualified specialist.",
  "Mold / Microbial Growth":
    "The inspection is not a mold assessment unless specifically contracted for. Visible suspect staining or moisture concerns should be further evaluated by a qualified specialist if needed.",
  "Pest / Wood Destroying Insects":
    "This inspection is not a wood-destroying insect inspection unless specifically contracted for. A licensed pest professional should be consulted for confirmation of insect activity or damage.",
  "Code Compliance":
    "This inspection is not a code compliance inspection. Comments are based on visible safety, function, and condition at the time of inspection.",
  "Concealed / Inaccessible Areas":
    "Concealed, hidden, or inaccessible areas could not be fully evaluated. Defects may exist behind finishes, stored items, insulation, wall coverings, flooring, or other obstructions.",
  "Snow / Weather Limitations":
    "Weather conditions may have limited visibility and access to some exterior components. Snow, ice, rain, or wet surfaces can conceal defects and limit inspection accuracy.",
  "Personal Property / Stored Items":
    "Personal property, furniture, stored items, or occupant belongings limited visibility and access to some components. Areas behind or beneath these items were not fully inspected.",
  "Utilities Off / Not Operated":
    "Some systems or components could not be operated because utilities were off, disconnected, inaccessible, or otherwise unavailable at the time of inspection.",
  "Permit / Previous Work Unknown":
    "The history, permits, and workmanship of previous repairs or improvements were not verified as part of this inspection. Further review with the local authority or qualified contractor may be appropriate.",
  "Older Electrical System":
    "Older electrical systems may not include modern grounding, GFCI protection, AFCI protection, panel labeling, wiring methods, or safety standards. This inspection was visual and non-invasive. Further evaluation by a qualified electrician is recommended where older, altered, damaged, or unsafe electrical conditions are observed.",
  "Older Plumbing Materials":
    "Older plumbing materials such as galvanized supply piping, cast iron drain piping, older copper piping, or other aging components may be present. Plumbing components can deteriorate from the inside or in concealed areas. Further evaluation by a qualified plumber is recommended where corrosion, leaks, poor flow, drainage issues, or aging materials are observed.",
  "Aluminum Wiring":
    "Some homes from the mid-1960s through 1970s may contain aluminum branch-circuit wiring. No destructive verification was performed as part of this inspection. If aluminum wiring is present or suspected, evaluation by a qualified electrician familiar with aluminum wiring repair methods is recommended.",
  "Knob-and-Tube Wiring":
    "Older homes may contain knob-and-tube wiring or remnants of obsolete wiring systems. The inspection was visual and non-invasive, and concealed wiring could not be fully verified. Evaluation by a qualified electrician is recommended if knob-and-tube wiring is observed, suspected, active, or abandoned in place.",
  "Federal Pacific / Zinsco Panels":
    "Certain older electrical panels, including Federal Pacific and Zinsco equipment, have known industry concerns. If such equipment is present or suspected, further evaluation by a qualified electrician is recommended. This inspection does not determine product recall status, internal panel condition beyond visible components, or insurability.",
  "Oil Tank / Fuel Storage":
    "Fuel oil tanks, abandoned fuel lines, or evidence of previous fuel storage may involve leakage, environmental concerns, or hidden conditions. Environmental testing, soil testing, tank integrity evaluation, and abandoned tank verification are outside the scope of a standard visual inspection unless specifically contracted.",
  "Vermiculite Insulation":
    "Vermiculite insulation may contain asbestos and should not be disturbed without proper evaluation. No asbestos testing was performed as part of this inspection. Confirmation requires laboratory testing by a qualified environmental professional.",
  "Polybutylene Plumbing":
    "Polybutylene plumbing has known industry concerns related to premature failure. If polybutylene piping is present or suspected, further evaluation by a qualified plumber is recommended. Concealed portions of the plumbing system could not be fully evaluated during this visual inspection.",
};

type AgeBasedDisclaimerRule = {
  topic: string;
  maxYear: number;
  label: string;
  reason: string;
  disclaimerText: string;
};

const AGE_BASED_DISCLAIMER_RULES: AgeBasedDisclaimerRule[] = [
  {
    topic: "Older Home Disclaimer",
    maxYear: 1999,
    label: "Older home materials and concealed conditions",
    reason: "Homes built before 2000 may include older materials, methods, and concealed conditions that are not fully visible during a non-invasive inspection.",
    disclaimerText:
      "Based on the reported age of the home, older construction methods, materials, repairs, and concealed conditions may be present. This inspection was visual and non-invasive. Hidden conditions behind finishes, insulation, wall coverings, flooring, stored items, or other obstructions could not be fully evaluated and may require further review by qualified specialists or contractors.",
  },
  {
    topic: "Lead-Based Paint",
    maxYear: 1977,
    label: "Lead-based paint potential",
    reason: "Homes built before 1978 may contain lead-based paint.",
    disclaimerText:
      "Because this home was reportedly built prior to 1978, lead-based paint may be present on interior or exterior painted surfaces. No lead testing was performed as part of this visual home inspection. Confirmation requires testing by a qualified lead professional. Painted surfaces should be maintained in good condition, and renovation or disturbance of older painted materials should follow applicable lead-safe practices.",
  },
  {
    topic: "Asbestos",
    maxYear: 1989,
    label: "Asbestos-containing material potential",
    reason: "Many homes built before the late 1980s may contain asbestos-containing building materials.",
    disclaimerText:
      "Because this home was reportedly built before modern asbestos restrictions were common, some building materials may contain asbestos. Materials that may be of concern can include certain insulation, flooring, ceiling texture, siding, roofing, duct materials, and other older products. No asbestos testing was performed as part of this visual inspection. Confirmation requires laboratory testing by a qualified asbestos professional before disturbing suspect materials.",
  },
  {
    topic: "Environmental / Hazardous Materials",
    maxYear: 1989,
    label: "Older hazardous material potential",
    reason: "Older homes may include materials or conditions that require environmental testing outside the scope of a standard inspection.",
    disclaimerText:
      "Due to the age of the home, environmental or hazardous material concerns may be present, including but not limited to lead-based paint, asbestos-containing materials, buried tanks, contaminated materials, or other conditions not visible during a standard inspection. Environmental testing and hazardous material identification are outside the scope of this visual home inspection unless specifically contracted and sampled by a qualified specialist.",
  },
  {
    topic: "Code Compliance",
    maxYear: 2005,
    label: "Modern standards may differ",
    reason: "Older homes were often built under different standards than current construction practices.",
    disclaimerText:
      "This home may have been built under older construction standards that differ from current building practices. This inspection is not a code compliance inspection. Comments are based on visible safety, function, and condition at the time of inspection. Upgrades may be recommended where older conditions present safety, performance, or reliability concerns, even if those conditions may have been common when the home was originally built.",
  },
  {
    topic: "Permit / Previous Work Unknown",
    maxYear: 1999,
    label: "Older repairs and alterations may be present",
    reason: "Older homes commonly have prior repairs, remodeling, or additions with unknown permits or workmanship.",
    disclaimerText:
      "Due to the age of the property, prior repairs, alterations, additions, or remodeling may have been performed over time. Permit history, code approval, and workmanship of previous work were not verified as part of this inspection. Further review with the local authority, seller documentation, or qualified contractors may be appropriate when confirming the history or compliance of past improvements.",
  },
  {
    topic: "Concealed / Inaccessible Areas",
    maxYear: 1999,
    label: "Hidden older conditions may exist",
    reason: "Older homes can have concealed defects behind finishes, insulation, flooring, or stored items.",
    disclaimerText:
      "Older homes may contain concealed or inaccessible conditions that are not visible during a standard, non-invasive inspection. Defects may exist behind finishes, wall coverings, flooring, insulation, stored items, or other obstructions. The inspection was limited to visible and readily accessible components at the time of inspection.",
  },
  {
    topic: "Mold / Microbial Growth",
    maxYear: 1999,
    label: "Older moisture history potential",
    reason: "Older homes may have past or hidden moisture conditions that are not visible without invasive evaluation.",
    disclaimerText:
      "Due to the age of the home, past or hidden moisture conditions may exist in concealed areas. This inspection is not a mold assessment unless specifically contracted for. Visible suspect staining, moisture damage, musty odors, or water intrusion concerns should be further evaluated by a qualified specialist if confirmation or sampling is desired.",
  },
];


type FindingBasedDisclaimerRule = {
  topic: string;
  keywords: string[];
  label: string;
  reason: string;
  disclaimerText: string;
};

const FINDING_BASED_DISCLAIMER_RULES: FindingBasedDisclaimerRule[] = [
  {
    topic: "Older Electrical System",
    keywords: ["ungrounded", "two prong", "2 prong", "cloth wiring", "older wiring", "open ground", "no ground", "gfci", "afci"],
    label: "Older electrical limitations",
    reason: "Findings mention older wiring, grounding, or modern electrical safety protection concerns.",
    disclaimerText: DEFAULT_TEXT["Older Electrical System"],
  },
  {
    topic: "Aluminum Wiring",
    keywords: ["aluminum wiring", "aluminum branch", "solid aluminum"],
    label: "Aluminum wiring concern",
    reason: "Findings mention aluminum branch-circuit wiring or a related concern.",
    disclaimerText: DEFAULT_TEXT["Aluminum Wiring"],
  },
  {
    topic: "Knob-and-Tube Wiring",
    keywords: ["knob and tube", "knob-and-tube", "knob tube"],
    label: "Knob-and-tube wiring concern",
    reason: "Findings mention knob-and-tube wiring or remnants of an obsolete wiring system.",
    disclaimerText: DEFAULT_TEXT["Knob-and-Tube Wiring"],
  },
  {
    topic: "Federal Pacific / Zinsco Panels",
    keywords: ["federal pacific", "fpe", "zinsco", "sylvani a", "stab lok", "stab-lok"],
    label: "Older panel concern",
    reason: "Findings mention Federal Pacific, Zinsco, Stab-Lok, or a similar older panel concern.",
    disclaimerText: DEFAULT_TEXT["Federal Pacific / Zinsco Panels"],
  },
  {
    topic: "Older Plumbing Materials",
    keywords: ["galvanized", "cast iron", "old plumbing", "corroded pipe", "drain piping", "supply piping"],
    label: "Older plumbing material limitation",
    reason: "Findings mention galvanized, cast iron, corrosion, or older plumbing materials.",
    disclaimerText: DEFAULT_TEXT["Older Plumbing Materials"],
  },
  {
    topic: "Polybutylene Plumbing",
    keywords: ["polybutylene", "poly b", "pb pipe", "quest piping"],
    label: "Polybutylene plumbing concern",
    reason: "Findings mention polybutylene or suspected polybutylene plumbing.",
    disclaimerText: DEFAULT_TEXT["Polybutylene Plumbing"],
  },
  {
    topic: "Oil Tank / Fuel Storage",
    keywords: ["oil tank", "fuel oil", "abandoned tank", "buried tank", "oil line", "ust"],
    label: "Fuel storage / environmental concern",
    reason: "Findings mention an oil tank, abandoned fuel line, or possible fuel storage concern.",
    disclaimerText: DEFAULT_TEXT["Oil Tank / Fuel Storage"],
  },
  {
    topic: "Vermiculite Insulation",
    keywords: ["vermiculite"],
    label: "Vermiculite insulation concern",
    reason: "Findings mention vermiculite insulation, which can require environmental testing before disturbance.",
    disclaimerText: DEFAULT_TEXT["Vermiculite Insulation"],
  },
  {
    topic: "Asbestos",
    keywords: ["asbestos", "transite", "9x9", "popcorn ceiling", "duct wrap", "old floor tile"],
    label: "Asbestos material concern",
    reason: "Findings mention materials commonly associated with possible asbestos-containing products.",
    disclaimerText: DEFAULT_TEXT.Asbestos,
  },
  {
    topic: "Mold / Microbial Growth",
    keywords: ["mold", "microbial", "fungal", "musty", "staining", "water intrusion", "moisture damage"],
    label: "Moisture / microbial concern",
    reason: "Findings mention moisture, staining, musty odor, or possible microbial growth.",
    disclaimerText: DEFAULT_TEXT["Mold / Microbial Growth"],
  },
  {
    topic: "Snow / Weather Limitations",
    keywords: ["snow", "ice", "frost", "rain", "weather limited", "wet roof", "roof covered"],
    label: "Weather limitation",
    reason: "Findings mention weather conditions that can limit visibility or access.",
    disclaimerText: DEFAULT_TEXT["Snow / Weather Limitations"],
  },
  {
    topic: "Concealed / Inaccessible Areas",
    keywords: ["not accessible", "inaccessible", "concealed", "limited access", "unable to inspect", "stored items", "personal property", "blocked"],
    label: "Concealed / inaccessible limitation",
    reason: "Findings mention limited access, concealed areas, stored items, or areas not fully visible.",
    disclaimerText: DEFAULT_TEXT["Concealed / Inaccessible Areas"],
  },
  {
    topic: "Utilities Off / Not Operated",
    keywords: ["utilities off", "gas off", "water off", "electric off", "not operated", "shut off", "could not operate"],
    label: "Utilities or systems not operated",
    reason: "Findings mention utilities or systems that could not be operated during the inspection.",
    disclaimerText: DEFAULT_TEXT["Utilities Off / Not Operated"],
  },
];

type DisclaimerSuggestion = {
  topic: string;
  label: string;
  reason: string;
  disclaimerText: string;
  source: "Age" | "Finding";
};

function parseYearBuilt(value: any) {
  const match = String(value || "").match(/(18|19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  if (!Number.isFinite(year) || year < 1800 || year > new Date().getFullYear() + 1) return null;
  return year;
}

function uniqueAgeRulesForYear(year: number | null) {
  if (!year) return [];

  const seen = new Set<string>();
  return AGE_BASED_DISCLAIMER_RULES.filter((rule) => {
    if (year > rule.maxYear) return false;
    if (seen.has(rule.topic)) return false;
    seen.add(rule.topic);
    return true;
  });
}

function getDeclinedSuggestionStorageKey(inspectionId: string) {
  return `opi-declined-disclaimer-suggestions-${inspectionId}`;
}

function readDeclinedSuggestionTopics(inspectionId: string) {
  if (typeof window === "undefined" || !inspectionId) return new Set<string>();

  try {
    const raw = window.localStorage.getItem(getDeclinedSuggestionStorageKey(inspectionId));
    const values = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(values) ? values : []).map((value) => String(value)));
  } catch {
    return new Set<string>();
  }
}

function writeDeclinedSuggestionTopics(inspectionId: string, topics: Set<string>) {
  if (typeof window === "undefined" || !inspectionId) return;

  try {
    window.localStorage.setItem(
      getDeclinedSuggestionStorageKey(inspectionId),
      JSON.stringify(Array.from(topics))
    );
  } catch {}
}


type DisclaimerRow = {
  id: string;
  inspection_id: string;
  topic: string;
  rough_notes?: string | null;
  disclaimer_text?: string | null;
  created_at?: string;
};

function ReportDisclaimers({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DisclaimerRow[]>([]);
  const [activeTopic, setActiveTopic] = useState(DEFAULT_DISCLAIMER_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [roughNotes, setRoughNotes] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [inspectionYear, setInspectionYear] = useState<number | null>(null);
  const [findingText, setFindingText] = useState("");
  const [declinedSuggestionTopics, setDeclinedSuggestionTopics] = useState<Set<string>>(
    () => readDeclinedSuggestionTopics(inspectionId)
  );



  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  useEffect(() => {
    async function loadDisclaimers() {
      if (!inspectionId) return;

      const [{ data, error }, inspectionResult, findingsResult] = await Promise.all([
        supabase
          .from("report_disclaimers")
          .select("*")
          .eq("inspection_id", inspectionId)
          .order("created_at", { ascending: true }),
        supabase
          .from("inspections")
          .select("year_built, built_year, construction_year, property_year_built")
          .eq("id", inspectionId)
          .maybeSingle(),
        supabase
          .from("findings")
          .select("title, observation, implication, recommendation, comment, section, severity")
          .eq("inspection_id", inspectionId),
      ]);

      if (error) {
        console.error("Failed to load disclaimers:", error);
        return;
      }

      setRows(data || []);

      if (!inspectionResult.error) {
        setInspectionYear(
          parseYearBuilt(
            inspectionResult.data?.year_built ||
              inspectionResult.data?.built_year ||
              inspectionResult.data?.construction_year ||
              inspectionResult.data?.property_year_built
          )
        );
      }

      if (!findingsResult.error) {
        setFindingText(
          (findingsResult.data || [])
            .map((finding: any) =>
              [
                finding.title,
                finding.observation,
                finding.implication,
                finding.recommendation,
                finding.comment,
                finding.section,
                finding.severity,
              ]
                .filter(Boolean)
                .join(" ")
            )
            .join(" ")
            .toLowerCase()
        );
      }
    }

    loadDisclaimers();
  }, [inspectionId]);

  useEffect(() => {
    setDeclinedSuggestionTopics(readDeclinedSuggestionTopics(inspectionId));
  }, [inspectionId]);

  const selectedTopics = useMemo(
    () => new Set(rows.map((row) => row.topic)),
    [rows]
  );

  const recommendedSuggestions = useMemo<DisclaimerSuggestion[]>(() => {
    const map = new Map<string, DisclaimerSuggestion>();

    uniqueAgeRulesForYear(inspectionYear).forEach((rule) => {
      if (selectedTopics.has(rule.topic) || declinedSuggestionTopics.has(rule.topic)) return;
      map.set(rule.topic, {
        topic: rule.topic,
        label: rule.label,
        reason: rule.reason,
        disclaimerText: rule.disclaimerText,
        source: "Age",
      });
    });

    const text = findingText.toLowerCase();

    FINDING_BASED_DISCLAIMER_RULES.forEach((rule) => {
      if (selectedTopics.has(rule.topic) || declinedSuggestionTopics.has(rule.topic) || map.has(rule.topic)) return;
      if (!rule.keywords.some((keyword) => text.includes(keyword))) return;

      map.set(rule.topic, {
        topic: rule.topic,
        label: rule.label,
        reason: rule.reason,
        disclaimerText: rule.disclaimerText,
        source: "Finding",
      });
    });

    return Array.from(map.values());
  }, [declinedSuggestionTopics, findingText, inspectionYear, selectedTopics]);

  const declinedSuggestions = useMemo<DisclaimerSuggestion[]>(() => {
    if (declinedSuggestionTopics.size === 0) return [];

    const map = new Map<string, DisclaimerSuggestion>();

    uniqueAgeRulesForYear(inspectionYear).forEach((rule) => {
      if (selectedTopics.has(rule.topic) || !declinedSuggestionTopics.has(rule.topic)) return;
      map.set(rule.topic, {
        topic: rule.topic,
        label: rule.label,
        reason: rule.reason,
        disclaimerText: rule.disclaimerText,
        source: "Age",
      });
    });

    const text = findingText.toLowerCase();

    FINDING_BASED_DISCLAIMER_RULES.forEach((rule) => {
      if (selectedTopics.has(rule.topic) || map.has(rule.topic) || !declinedSuggestionTopics.has(rule.topic)) return;
      if (!rule.keywords.some((keyword) => text.includes(keyword))) return;

      map.set(rule.topic, {
        topic: rule.topic,
        label: rule.label,
        reason: rule.reason,
        disclaimerText: rule.disclaimerText,
        source: "Finding",
      });
    });

    return Array.from(map.values());
  }, [declinedSuggestionTopics, findingText, inspectionYear, selectedTopics]);

  const activeRow = rows.find((row) => row.topic === activeTopic);

  useEffect(() => {
    if (activeRow) {
      setRoughNotes(activeRow.rough_notes || "");
      setGeneratedText(activeRow.disclaimer_text || "");
    } else {
      setRoughNotes("");
      setGeneratedText("");
    }
  }, [activeTopic, activeRow?.id]);

  async function toggleDisclaimer(topic: string) {
    if (saving || !inspectionId) return;

    setActiveTopic(topic);
    setSaving(true);

    try {
      const existing = rows.find((row) => row.topic === topic);

      if (existing) {
        const { error } = await supabase
          .from("report_disclaimers")
          .delete()
          .eq("id", existing.id);

        if (error) throw error;

        setRows((prev) => prev.filter((row) => row.id !== existing.id));
        return;
      }

      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert({
          inspection_id: inspectionId,
          topic,
          rough_notes: "",
          disclaimer_text:
            DEFAULT_TEXT[topic] ||
            "This item was not fully evaluated as part of this visual, non-invasive home inspection.",
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) setRows((prev) => [...prev, data]);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to update disclaimer.");
    } finally {
      setSaving(false);
    }
  }


  function declineSuggestedDisclaimer(rule: DisclaimerSuggestion) {
    if (!inspectionId) return;

    setDeclinedSuggestionTopics((prev) => {
      const next = new Set(prev);
      next.add(rule.topic);
      writeDeclinedSuggestionTopics(inspectionId, next);
      return next;
    });

    showMessage("success", `${rule.topic} suggestion declined.`);
  }

  function restoreSuggestedDisclaimer(topic: string) {
    if (!inspectionId) return;

    setDeclinedSuggestionTopics((prev) => {
      const next = new Set(prev);
      next.delete(topic);
      writeDeclinedSuggestionTopics(inspectionId, next);
      return next;
    });

    showMessage("success", `${topic} suggestion restored.`);
  }

  function restoreAllDeclinedSuggestions() {
    if (!inspectionId) return;

    const next = new Set<string>();
    writeDeclinedSuggestionTopics(inspectionId, next);
    setDeclinedSuggestionTopics(next);
    showMessage("success", "Declined disclaimer suggestions restored.");
  }

  async function addSuggestedDisclaimer(rule: DisclaimerSuggestion) {
    if (saving || !inspectionId || selectedTopics.has(rule.topic)) return;

    setSaving(true);
    setActiveTopic(rule.topic);

    try {
      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert({
          inspection_id: inspectionId,
          topic: rule.topic,
          rough_notes:
            rule.source === "Age" && inspectionYear
              ? `Suggested automatically because the home was built in ${inspectionYear}. ${rule.reason}`
              : `Suggested automatically from report data. ${rule.reason}`,
          disclaimer_text: rule.disclaimerText,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) {
        setRows((prev) => [...prev, data]);
        setRoughNotes(data.rough_notes || "");
        setGeneratedText(data.disclaimer_text || "");
      }

      setDeclinedSuggestionTopics((prev) => {
        if (!prev.has(rule.topic)) return prev;
        const next = new Set(prev);
        next.delete(rule.topic);
        writeDeclinedSuggestionTopics(inspectionId, next);
        return next;
      });

      showMessage("success", `${rule.topic} disclaimer added.`);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add suggested disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  async function addAllSuggestedDisclaimers() {
    if (saving || !inspectionId || recommendedSuggestions.length === 0) return;

    setSaving(true);

    try {
      const payload = recommendedSuggestions.map((rule) => ({
        inspection_id: inspectionId,
        topic: rule.topic,
        rough_notes:
          rule.source === "Age" && inspectionYear
            ? `Suggested automatically because the home was built in ${inspectionYear}. ${rule.reason}`
            : `Suggested automatically from report data. ${rule.reason}`,
        disclaimer_text: rule.disclaimerText,
      }));

      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert(payload)
        .select("*");

      if (error) throw error;

      if (data?.length) {
        setRows((prev) => [...prev, ...data]);
        setActiveTopic(data[0].topic);
        setRoughNotes(data[0].rough_notes || "");
        setGeneratedText(data[0].disclaimer_text || "");
      }

      showMessage("success", `${payload.length} suggested disclaimer${payload.length === 1 ? "" : "s"} added.`);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add suggested disclaimers.");
    } finally {
      setSaving(false);
    }
  }

  async function addCustomDisclaimer() {
    const clean = customTopic.trim();

    if (!clean || saving) return;

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("report_disclaimers")
        .insert({
          inspection_id: inspectionId,
          topic: clean,
          rough_notes: "",
          disclaimer_text:
            "This condition or limitation was noted at the time of inspection. Further review may be appropriate if additional confirmation is desired.",
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) {
        setRows((prev) => [...prev, data]);
        setActiveTopic(data.topic);
      }

      setCustomTopic("");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  async function generateDisclaimer() {
    const finalTopic = activeTopic;

    if (!finalTopic) {
      showMessage("error", "Choose a disclaimer first.");
      return;
    }

    if (!roughNotes.trim()) {
      showMessage("error", "Add a short note for the AI first.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/generate-disclaimer-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: finalTopic,
          notes: roughNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage("error", data.error || "Failed to generate disclaimer.");
        return;
      }

      setGeneratedText(data.disclaimer || "");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to generate disclaimer.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveActiveDisclaimer() {
    if (!activeTopic) {
      showMessage("error", "Choose a disclaimer first.");
      return;
    }

    if (!generatedText.trim()) {
      showMessage("error", "No disclaimer text to save.");
      return;
    }

    setSaving(true);

    try {
      if (activeRow) {
        const { data, error } = await supabase
          .from("report_disclaimers")
          .update({
            rough_notes: roughNotes.trim(),
            disclaimer_text: generatedText.trim(),
          })
          .eq("id", activeRow.id)
          .select("*")
          .single();

        if (error) throw error;

        setRows((prev) =>
          prev.map((row) => (row.id === activeRow.id ? data : row))
        );
      } else {
        const { data, error } = await supabase
          .from("report_disclaimers")
          .insert({
            inspection_id: inspectionId,
            topic: activeTopic,
            rough_notes: roughNotes.trim(),
            disclaimer_text: generatedText.trim(),
          })
          .select("*")
          .single();

        if (error) throw error;

        if (data) setRows((prev) => [...prev, data]);
      }

      showMessage("success", "Disclaimer saved.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save disclaimer.");
    } finally {
      setSaving(false);
    }
  }

  const customRows = rows.filter(
    (row) => !DEFAULT_DISCLAIMER_TOPICS.includes(row.topic)
  );

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/50"
      >
        <div>
          <h3 className="text-xl font-black text-teal-300">Disclaimers</h3>
          <p className="mt-1 text-sm text-slate-400">
            {rows.length > 0
              ? `${rows.length} disclaimer${rows.length === 1 ? "" : "s"} turned on`
              : "No disclaimers turned on"}
            {recommendedSuggestions.length > 0
              ? ` • ${recommendedSuggestions.length} AI suggestion${recommendedSuggestions.length === 1 ? "" : "s"} ready`
              : ""}
          </p>
        </div>

        <span className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200">
          {open ? "Hide" : "Show"}
        </span>
      </button>



      {message && (
        <div
          className={`border-t border-slate-700 px-5 py-3 text-sm font-bold ${
            messageType === "success"
              ? "bg-emerald-950/30 text-emerald-300"
              : "bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}


      {recommendedSuggestions.length > 0 && (
        <div className="border-t border-cyan-500/30 bg-cyan-500/10 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                AI Recommended Disclaimers
              </p>
              <p className="mt-1 text-sm font-bold leading-6 text-cyan-50">
                {recommendedSuggestions.length} suggestion{recommendedSuggestions.length === 1 ? "" : "s"} ready
                {inspectionYear ? ` based on a home built in ${inspectionYear}` : " based on this report"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                window.setTimeout(() => document.getElementById("ai-disclaimer-suggestions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
              }}
              className="rounded-xl border border-cyan-300 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-400/20"
            >
              Review Suggestions
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border-t border-slate-700 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setActiveTopic(row.topic)}
                className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-sm font-bold text-yellow-200 hover:bg-yellow-500/20"
              >
                {row.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-700 p-5">
          <div id="ai-disclaimer-suggestions" className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-cyan-300">
                  AI Recommended Disclaimers
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {inspectionYear
                    ? `Home built in ${inspectionYear}. Suggested disclaimers are generated from the year built and the findings you have documented.`
                    : "Enter or auto-fill the year built on the report. The system also scans findings for conditions that may need disclaimers."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {inspectionYear ? (
                  <span className="w-fit rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs font-black text-cyan-100">
                    Year Built: {inspectionYear}
                  </span>
                ) : null}
                {recommendedSuggestions.length > 0 ? (
                  <button
                    type="button"
                    onClick={addAllSuggestedDisclaimers}
                    disabled={saving}
                    className="rounded-full border border-emerald-400/60 bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
                  >
                    Add All Suggested
                  </button>
                ) : null}
              </div>
            </div>

            {recommendedSuggestions.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {recommendedSuggestions.map((rule) => (
                  <div
                    key={rule.topic}
                    className="rounded-xl border border-cyan-400/40 bg-[#020617] p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-500/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-white">{rule.topic}</p>
                        <p className="mt-1 text-sm font-bold text-cyan-200">{rule.label}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-slate-500/60 bg-slate-500/10 px-3 py-1 text-[10px] font-black uppercase text-slate-200">
                        {rule.source}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{rule.reason}</p>
                    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
                      {rule.disclaimerText}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addSuggestedDisclaimer(rule)}
                        disabled={saving}
                        className="rounded-full border border-cyan-400/60 bg-cyan-500/15 px-4 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add Disclaimer
                      </button>

                      <button
                        type="button"
                        onClick={() => declineSuggestedDisclaimer(rule)}
                        disabled={saving}
                        className="rounded-full border border-slate-500/70 bg-slate-500/10 px-4 py-2 text-xs font-black text-slate-200 hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : inspectionYear ? (
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
                All current AI disclaimer suggestions for this home are already added or declined.
              </div>
            ) : null}

            {declinedSuggestions.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-600 bg-slate-950/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                      Declined Suggestions
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      These suggestions are hidden from AI Recommended unless you restore them.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={restoreAllDeclinedSuggestions}
                    disabled={saving}
                    className="rounded-full border border-slate-400/70 bg-slate-500/10 px-3 py-1 text-xs font-black text-slate-100 hover:bg-slate-500/20 disabled:opacity-60"
                  >
                    Restore All
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {declinedSuggestions.map((rule) => (
                    <button
                      key={rule.topic}
                      type="button"
                      onClick={() => restoreSuggestedDisclaimer(rule.topic)}
                      disabled={saving}
                      className="rounded-full border border-slate-500/70 bg-[#020617] px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400 hover:text-cyan-100 disabled:opacity-60"
                    >
                      Restore {rule.topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
              Turn Disclaimers On / Off
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DEFAULT_DISCLAIMER_TOPICS.map((item) => {
                const selected = selectedTopics.has(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleDisclaimer(item)}
                    disabled={saving}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-yellow-400 bg-yellow-500/15 text-yellow-100"
                        : "border-slate-600 bg-[#020617] text-white hover:border-yellow-400 hover:bg-yellow-500/10"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        selected
                          ? "border-yellow-300 bg-yellow-400 text-slate-950"
                          : "border-white"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>

                    <span className="font-bold">{item}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700 bg-[#020617] p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                + Custom Disclaimer
              </p>

              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={customTopic}
                  onChange={(event) => setCustomTopic(event.target.value)}
                  placeholder="Add custom disclaimer topic..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-white outline-none focus:border-yellow-400"
                />

                <button
                  type="button"
                  onClick={addCustomDisclaimer}
                  disabled={saving || !customTopic.trim()}
                  className="rounded-lg border border-yellow-500 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {customRows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => toggleDisclaimer(row.topic)}
                      className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/20"
                    >
                      {row.topic} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-purple-300">
              AI Disclaimer Editor
            </p>

            <label className="mt-4 block">
              <p className="mb-2 text-sm font-bold text-slate-300">
                Active Disclaimer
              </p>

              <select
                value={activeTopic}
                onChange={(event) => setActiveTopic(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-purple-400"
              >
                {[
                  ...DEFAULT_DISCLAIMER_TOPICS,
                  ...customRows.map((row) => row.topic),
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <textarea
              value={roughNotes}
              onChange={(event) => setRoughNotes(event.target.value)}
              rows={3}
              placeholder="Example: home built before 1978, no testing performed, older painted surfaces may contain lead..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white outline-none focus:border-purple-400"
            />

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generateDisclaimer}
                disabled={generating || saving || !roughNotes.trim()}
                className="rounded-xl bg-purple-500 px-5 py-3 font-black text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? "Generating..." : "AI Fill Disclaimer"}
              </button>

              <button
                type="button"
                onClick={saveActiveDisclaimer}
                disabled={saving || !generatedText.trim()}
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Disclaimer Text
              </button>
            </div>

            <textarea
              value={generatedText}
              onChange={(event) => setGeneratedText(event.target.value)}
              rows={6}
              placeholder="Disclaimer text will appear here..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ReportDisclaimers);
