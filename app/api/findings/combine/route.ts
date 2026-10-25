import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";
import { loadWritingConfigForInspection } from "../../../../lib/ai/loadWritingConfig";
import {
  mergeFindingsNarrative,
  severityRank,
  cleanStr as clean,
} from "../../../../lib/ai/combineFindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fields we snapshot/recreate for a finding. Kept to columns that definitely
// exist so recreating a split-out finding never 400s on an unknown column.
function snapshotFields(row: any) {
  return {
    section: clean(row.section),
    location: clean(row.location),
    title: clean(row.title),
    severity: clean(row.severity),
    observation: clean(row.observation),
    implication: clean(row.implication),
    recommendation: clean(row.recommendation),
    sort_order: row.sort_order ?? null,
    // Preserve nested reversibility: if this finding was itself a combined one,
    // keep its own sources so a later uncombine can still split it further.
    combined_sources: row.combined_sources ?? null,
  };
}

// Combine several findings of the same defect (found at different locations)
// into ONE finding. The AI rewrites a single clean narrative that names every
// location; all photos from the merged findings move onto the surviving one and
// the others are deleted. The originals are snapshotted into
// findings.combined_sources on the survivor first, so the combine is reversible.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const rawIds: any[] = Array.isArray(body?.findingIds) ? body.findingIds : [];
    const findingIds = Array.from(new Set(rawIds.map((id) => clean(id)).filter(Boolean)));

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    if (findingIds.length < 2) {
      return NextResponse.json(
        { error: "Select at least two defects to combine." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Only combine findings that actually belong to this inspection.
    const { data: findings, error: findingsError } = await admin
      .from("findings")
      .select("*")
      .in("id", findingIds)
      .eq("inspection_id", inspectionId);

    if (findingsError) throw findingsError;

    const rows = findings || [];
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "Could not find the selected defects on this report." },
        { status: 400 },
      );
    }

    // The surviving finding is the most serious one (keeps the strongest
    // severity); ties keep the earliest so its photos/order are preserved.
    const target = [...rows].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    )[0];
    const otherIds = rows.map((r: any) => r.id).filter((id: any) => id !== target.id);

    // Snapshot which photos belong to each source BEFORE moving them, so an
    // uncombine can send each photo back to the finding it came from.
    const { data: photoRows } = await admin
      .from("photos")
      .select("id, finding_id")
      .in("finding_id", findingIds)
      .eq("inspection_id", inspectionId);
    const photoIdsByFinding: Record<string, string[]> = {};
    for (const p of photoRows || []) {
      const fid = String(p.finding_id);
      (photoIdsByFinding[fid] ||= []).push(String(p.id));
    }

    // Build the reversible snapshot: every source, with the target flagged.
    const sources = rows.map((row: any) => ({
      wasPrimary: row.id === target.id,
      fields: snapshotFields(row),
      photoIds: photoIdsByFinding[String(row.id)] || [],
    }));

    // On-brand wording (company AI Writing Studio settings).
    const writingConfig = await loadWritingConfigForInspection(inspectionId);
    const merged = await mergeFindingsNarrative(openai, rows, writingConfig, {
      title: target.title,
      severity: target.severity,
      observation: target.observation,
      implication: target.implication,
      recommendation: target.recommendation,
    });

    // 1) Move every photo from the merged findings onto the surviving finding.
    if (otherIds.length) {
      const { error: movePhotosError } = await admin
        .from("photos")
        .update({ finding_id: target.id })
        .in("finding_id", otherIds)
        .eq("inspection_id", inspectionId);
      if (movePhotosError) throw movePhotosError;
    }

    // 2) Rewrite the surviving finding with the combined narrative + snapshot.
    const { data: updated, error: updateError } = await admin
      .from("findings")
      .update({
        title: merged.title,
        severity: merged.severity,
        observation: merged.observation,
        implication: merged.implication,
        recommendation: merged.recommendation,
        combined_sources: { version: 1, combinedAt: new Date().toISOString(), sources },
      })
      .eq("id", target.id)
      .eq("inspection_id", inspectionId)
      .select("id, title, section, severity, observation, implication, recommendation")
      .maybeSingle();
    if (updateError) throw updateError;

    // 3) Delete the now-merged findings.
    if (otherIds.length) {
      const { error: deleteError } = await admin
        .from("findings")
        .delete()
        .in("id", otherIds)
        .eq("inspection_id", inspectionId);
      if (deleteError) throw deleteError;
    }

    return NextResponse.json({
      ok: true,
      finding: updated,
      combinedCount: rows.length,
      keptId: target.id,
      removedIds: otherIds,
    });
  } catch (error: any) {
    console.error("Combine findings error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to combine defects." },
      { status: 500 },
    );
  }
}
