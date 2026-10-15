import { getAIModel } from "../openai";

// Shared limitation-note generator: a rough inspector note (typed or spoken) →
// a short Title-Case title + a concise, cautious limitation statement. Used by
// the report-builder "+ Add a limitation" box (/api/generate-limitation-note)
// AND the live camera's voice "add limitation …" command, so the wording stays
// identical everywhere. Keep the prompt here — don't re-inline it per caller.
export async function generateLimitationNote({
  section,
  notes,
  selectedLimitations,
}: {
  section?: string;
  notes: string;
  selectedLimitations?: string[];
}): Promise<{ title: string; comment: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const prompt = `
You are writing a professional home inspection report limitation.

Section: ${section || "Unknown"}

Selected limitation conditions:
${Array.isArray(selectedLimitations) && selectedLimitations.length > 0
    ? selectedLimitations.join(", ")
    : "None selected"}

Inspector rough note:
${notes}

Produce TWO things for this limitation:
1. "title": a SHORT label (2-5 words, Title Case) naming the limitation — e.g. "Attic Access Limited", "Panel Cover Not Removed", "Vegetation Obstruction". No trailing period.
2. "comment": one concise, clear limitation statement in a professional home inspection style.

Rules for the comment: Do not overstate. Do not mention code compliance. Do not say the inspector was negligent. Explain that visibility/access/operation was limited and recommend further evaluation only when appropriate.

Return ONLY valid JSON: {"title":"","comment":""}
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write concise professional limitations for home inspection reports and return them as JSON with a short title and a comment.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "AI request failed.");
  }

  let title = "";
  let comment = "";
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    title = String(parsed.title || "").trim();
    comment = String(parsed.comment || "").trim();
  } catch {
    comment = String(data?.choices?.[0]?.message?.content || "").trim();
  }

  if (!comment) comment = "Inspection of this area was limited at the time of inspection.";
  if (!title) title = "Inspection Limitation";

  return { title, comment };
}
