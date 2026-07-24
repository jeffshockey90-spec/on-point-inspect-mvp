import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAIModel } from "../../../lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server routes cannot always set cookies.
          }
        },
      },
    }
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing report id." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not logged in." },
        { status: 401 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", id)
      .eq("inspector_id", user.id)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const { data: findingsRaw, error: findingsError } = await supabase
      .from("findings")
      .select("*")
      .eq("inspection_id", inspection.id)
      .order("created_at", { ascending: true });

    if (findingsError) {
      return NextResponse.json(
        { error: findingsError.message || "Could not load findings." },
        { status: 500 }
      );
    }

    const findings = findingsRaw || [];

    if (findings.length === 0) {
      return NextResponse.json({
        summary:
          "No defects or report findings have been added yet. Add findings before generating a report summary.",
      });
    }

    const findingText = findings
      .map((finding: any, index: number) => {
        return `
Finding ${index + 1}
Section: ${cleanText(finding.section) || "Not specified"}
Title: ${cleanText(finding.title) || "Untitled finding"}
Observation: ${cleanText(finding.observation) || "Not provided"}
Implication: ${cleanText(finding.implication) || "Not provided"}
Recommendation: ${cleanText(finding.recommendation) || "Not provided"}
Additional Notes: ${cleanText(finding.comment || finding.notes) || "None"}
        `.trim();
      })
      .join("\n\n---\n\n");

    const propertyDetails = `
Address: ${cleanText(inspection.address || inspection.property_address)}
Client: ${cleanText(inspection.client_name)}
Realtor: ${cleanText(inspection.realtor_name)}
Inspection Date: ${cleanText(inspection.inspection_date)}
Year Built: ${cleanText(inspection.year_built)}
Square Feet: ${cleanText(inspection.square_feet || inspection.sqft)}
    `.trim();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getAIModel(),
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content:
              "You are a senior certified home inspector writing a client- and realtor-friendly report summary from actual inspection findings. Focus on defects, safety concerns, material concerns, major repair items, meaningful limitations, and recommendations. Do not summarize normal checklist items or general property details unless they relate to a defect. Do not invent anything. Do not say systems are functional, safe, code-compliant, or in good condition unless the report specifically says so. Return only the summary text.",
          },
          {
            role: "user",
            content: `
Create a defect-focused Report Summary using ONLY the information below.

PROPERTY / INSPECTION DETAILS:
${propertyDetails}

ACTUAL REPORT FINDINGS:
${findingText}

FORMAT:
- Title it exactly: Report Summary
- Start with a short overview focused on notable defects only.
- Group defects by section.
- Include why the item matters and the recommended next step.
- Skip sections with no defects.
- Do not include placeholders, signatures, or thank-you language.
- Return only the report summary text.
            `.trim(),
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "OpenAI request failed." },
        { status: response.status }
      );
    }

    const summary = data?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: "OpenAI returned no summary." },
        { status: 500 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate summary." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { id, summary } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing report id." },
        { status: 400 }
      );
    }

    if (!summary || !String(summary).trim()) {
      return NextResponse.json(
        { error: "Missing summary." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not logged in." },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from("inspections")
      .update({
        report_summary: String(summary).trim(),
      })
      .eq("id", id)
      .eq("inspector_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not save summary." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: String(summary).trim(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save summary." },
      { status: 500 }
    );
  }
}
