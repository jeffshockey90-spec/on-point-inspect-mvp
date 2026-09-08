import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, notFound, getAdminClient, authorizeInspection } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Executes the two Tier-2 actions that don't already have a route: reschedule
// and add_note. Reminders go through the existing /api/send-*-reminder routes.
//
// Security: this re-authenticates and re-scopes on its own (authorizeInspection)
// and never trusts anything but the inspection id + the validated params — the
// client can't redirect it to an inspection the user can't access, and nothing
// here emails a client or touches money.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}) as any);
    const kind = String(body.kind || "").trim();
    const inspectionId = String(body.inspection_id || "").trim();
    if (!inspectionId) return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId);
    if (!authorized) return notFound("Inspection not found.");

    if (kind === "reschedule") {
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
      const update: any = { inspection_date: date };
      if (time) update.inspection_time = time;
      const { error } = await admin.from("inspections").update(update).eq("id", inspectionId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: `Rescheduled to ${date}${time ? ` ${time}` : ""}.` });
    }

    if (kind === "add_note") {
      const note = String(body.note || "").trim();
      if (!note) return NextResponse.json({ error: "Empty note." }, { status: 400 });

      const { data: current } = await admin.from("inspections").select("notes").eq("id", inspectionId).maybeSingle();
      const stamp = new Date().toISOString().slice(0, 10);
      const existing = String(current?.notes || "").trim();
      const combined = `${existing ? `${existing}\n` : ""}[${stamp} · Ask FLOW] ${note}`;
      const { error } = await admin.from("inspections").update({ notes: combined }).eq("id", inspectionId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Note added." });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Action failed." }, { status: 500 });
  }
}
