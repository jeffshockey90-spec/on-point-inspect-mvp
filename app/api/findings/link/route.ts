import { NextResponse } from "next/server";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

// Set the related-finding links for one finding, symmetrically (linking A to B
// stores B on A and A on B), plus a shared relationship note shown to the client.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = clean(body?.inspectionId || body?.inspection_id);
    const findingId = clean(body?.findingId || body?.finding_id);
    const note = clean(body?.note).slice(0, 2000);
    const relatedIds: string[] = Array.from(
      new Set<string>(
        (Array.isArray(body?.relatedIds) ? body.relatedIds : [])
          .map((id: any) => clean(id))
          .filter((id: string) => Boolean(id) && id !== findingId),
      ),
    );

    // Group mode: link a whole set of findings to EACH OTHER (full mesh), used by
    // the field "Link Findings" tool. Each one gets the others + the shared note.
    const groupIds: string[] = Array.from(
      new Set(
        (Array.isArray(body?.groupIds) ? body.groupIds : [])
          .map((id: any) => clean(id))
          .filter(Boolean),
      ),
    );

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });
    }

    if (groupIds.length >= 2) {
      const adminG = getAdminClient();
      const authorizedG = await authorizeInspection(adminG, user.id, inspectionId, "id");
      if (!authorizedG) return notFound();

      const noteG = clean(body?.note).slice(0, 2000) || null;
      for (const id of groupIds) {
        const others = groupIds.filter((x) => x !== id);
        const { error: gErr } = await adminG
          .from("findings")
          .update({ related_finding_ids: others, related_note: noteG })
          .eq("id", id)
          .eq("inspection_id", inspectionId);
        if (gErr) throw gErr;
      }
      return NextResponse.json({ ok: true, groupIds, note: noteG });
    }

    if (!findingId) {
      return NextResponse.json({ error: "Missing finding id." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: allFindings, error: loadError } = await admin
      .from("findings")
      .select("id, related_finding_ids, related_note")
      .eq("inspection_id", inspectionId);

    if (loadError) throw loadError;

    const findings = allFindings || [];
    if (!findings.some((f: any) => clean(f.id) === findingId)) {
      return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    }

    const relatedSet = new Set(relatedIds);
    const noteForGroup = note || null;
    const updates: { id: any; related_finding_ids: string[]; related_note: string | null }[] = [];

    for (const f of findings) {
      const fid = clean(f.id);
      const current = Array.isArray(f.related_finding_ids)
        ? f.related_finding_ids.map((x: any) => clean(x)).filter(Boolean)
        : [];

      if (fid === findingId) {
        // The finding being edited: its list is exactly the chosen set.
        updates.push({
          id: f.id,
          related_finding_ids: relatedIds,
          related_note: relatedIds.length > 0 ? noteForGroup : null,
        });
        continue;
      }

      const hadTarget = current.includes(findingId);
      const shouldHaveTarget = relatedSet.has(fid);

      if (shouldHaveTarget && !hadTarget) {
        const next = Array.from(new Set([...current, findingId]));
        updates.push({ id: f.id, related_finding_ids: next, related_note: noteForGroup });
      } else if (shouldHaveTarget && hadTarget) {
        // Already linked -> keep the relationship, refresh the shared note.
        updates.push({ id: f.id, related_finding_ids: current, related_note: noteForGroup });
      } else if (!shouldHaveTarget && hadTarget) {
        const next = current.filter((x) => x !== findingId);
        updates.push({
          id: f.id,
          related_finding_ids: next,
          related_note: next.length > 0 ? clean(f.related_note) || null : null,
        });
      }
    }

    for (const u of updates) {
      const { error: updErr } = await admin
        .from("findings")
        .update({
          related_finding_ids: u.related_finding_ids,
          related_note: u.related_note,
        })
        .eq("id", u.id)
        .eq("inspection_id", inspectionId);
      if (updErr) throw updErr;
    }

    return NextResponse.json({ ok: true, relatedIds, note: noteForGroup });
  } catch (error: any) {
    console.error("findings/link error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not link findings." },
      { status: 500 },
    );
  }
}
