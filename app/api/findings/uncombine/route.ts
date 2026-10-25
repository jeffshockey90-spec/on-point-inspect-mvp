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
import { mergeFindingsNarrative, cleanStr as clean } from "../../../../lib/ai/combineFindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Reverse a combine (see /api/findings/combine). A combined finding carries a
// snapshot of its original sources in findings.combined_sources. We can either
// split it fully back apart ("split-all") or pull a single location back out
// into its own finding ("remove-source"), re-merging whatever remains so the
// surviving write-up stays accurate.

type Source = { wasPrimary?: boolean; fields?: any; photoIds?: any };

// The editable fields to apply when restoring/recreating a finding. Whitelisted
// to columns that definitely exist so this never 400s on an unknown column.
function applyFields(fields: any) {
  const f = fields || {};
  const out: Record<string, any> = {
    section: clean(f.section),
    location: clean(f.location),
    title: clean(f.title) || "Finding",
    severity: clean(f.severity),
    observation: clean(f.observation),
    implication: clean(f.implication),
    recommendation: clean(f.recommendation),
    // Preserve nested reversibility if this source was itself a combined one.
    combined_sources: f.combined_sources ?? null,
  };
  if (f.sort_order !== null && f.sort_order !== undefined) out.sort_order = f.sort_order;
  return out;
}

async function recreateFinding(admin: any, inspectionId: string, source: Source) {
  const insert = { inspection_id: inspectionId, needs_review: false, ...applyFields(source.fields) };
  const { data: created, error } = await admin
    .from("findings")
    .insert(insert)
    .select("id")
    .single();
  if (error) throw error;

  const photoIds = Array.isArray(source.photoIds) ? source.photoIds.map(String) : [];
  if (photoIds.length) {
    await admin
      .from("photos")
      .update({ finding_id: created.id })
      .in("id", photoIds)
      .eq("inspection_id", inspectionId);
  }
  return created.id;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const findingId = clean(body?.findingId || body?.finding_id);
    const action = clean(body?.action) || "split-all";

    if (!inspectionId || !findingId) {
      return NextResponse.json({ error: "Missing inspectionId or findingId." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: survivor, error: loadError } = await admin
      .from("findings")
      .select("*")
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!survivor) return notFound();

    const cs = survivor.combined_sources;
    const sources: Source[] = Array.isArray(cs?.sources) ? cs.sources : [];
    if (sources.length < 2) {
      return NextResponse.json(
        { error: "This finding isn't a combined finding." },
        { status: 400 },
      );
    }

    // ---- Split fully back apart -------------------------------------------
    if (action === "split-all") {
      const primary = sources.find((s) => s.wasPrimary) || sources[0];
      const others = sources.filter((s) => s !== primary);

      // Restore the surviving row to the primary's original state.
      const { error: restoreError } = await admin
        .from("findings")
        .update(applyFields(primary.fields))
        .eq("id", findingId)
        .eq("inspection_id", inspectionId);
      if (restoreError) throw restoreError;

      // Move the primary's own photos back onto it (they may have been pulled
      // off during an earlier remove; harmless if already there).
      const primaryPhotos = Array.isArray(primary.photoIds) ? primary.photoIds.map(String) : [];
      if (primaryPhotos.length) {
        await admin
          .from("photos")
          .update({ finding_id: findingId })
          .in("id", primaryPhotos)
          .eq("inspection_id", inspectionId);
      }

      for (const src of others) {
        await recreateFinding(admin, inspectionId, src);
      }

      return NextResponse.json({ ok: true, action, restored: others.length + 1 });
    }

    // ---- Pull one location back out ---------------------------------------
    if (action === "remove-source") {
      const index = Number(body?.sourceIndex);
      if (!Number.isInteger(index) || index < 0 || index >= sources.length) {
        return NextResponse.json({ error: "Invalid location to remove." }, { status: 400 });
      }

      const removed = sources[index];
      // Recreate the removed location as its own standalone finding (its photos
      // move off the survivor onto the new finding).
      await recreateFinding(admin, inspectionId, removed);

      let remaining = sources.filter((_, i) => i !== index);

      // Only the primary left → fully restore the survivor to that original.
      if (remaining.length <= 1) {
        const sole = remaining[0] || removed;
        const { error: restoreError } = await admin
          .from("findings")
          .update(applyFields(sole.fields))
          .eq("id", findingId)
          .eq("inspection_id", inspectionId);
        if (restoreError) throw restoreError;
        return NextResponse.json({ ok: true, action, remaining: 1 });
      }

      // Still 2+ left → re-merge them into a fresh, clean combined write-up.
      if (!remaining.some((s) => s.wasPrimary)) remaining = remaining.map((s, i) => (i === 0 ? { ...s, wasPrimary: true } : s));
      const primary = remaining.find((s) => s.wasPrimary) || remaining[0];

      const writingConfig = await loadWritingConfigForInspection(inspectionId);
      const merged = await mergeFindingsNarrative(
        openai,
        remaining.map((s) => s.fields || {}),
        writingConfig,
        primary.fields,
      );

      const { error: updateError } = await admin
        .from("findings")
        .update({
          title: merged.title,
          severity: merged.severity,
          observation: merged.observation,
          implication: merged.implication,
          recommendation: merged.recommendation,
          combined_sources: {
            version: 1,
            combinedAt: cs?.combinedAt || new Date().toISOString(),
            sources: remaining,
          },
        })
        .eq("id", findingId)
        .eq("inspection_id", inspectionId);
      if (updateError) throw updateError;

      return NextResponse.json({ ok: true, action, remaining: remaining.length });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    console.error("Uncombine findings error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update the combined finding." },
      { status: 500 },
    );
  }
}
