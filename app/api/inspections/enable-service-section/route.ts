import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";
import { canonicalServiceKey } from "../../../../lib/agreementTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Services that have a dedicated, FLAG-GATED deliverable section. The builder,
// client portal, and client report all gate those panels on the matching
// inspection flag (service_mode is usually "home", so the name-based check is
// bypassed and the boolean flag is the real switch). Adding such a service later
// must flip its flag or the thing the client paid for never appears.
// To support a new flag-gated service, add one row here.
const FLAG_SERVICES: { match: RegExp; flag: "mold" | "radon" | "drone"; label: string; showsSection: boolean }[] = [
  { match: /mold/, flag: "mold", label: "Mold", showsSection: true },
  { match: /radon/, flag: "radon", label: "Radon", showsSection: true },
  { match: /drone|aerial/, flag: "drone", label: "Drone", showsSection: false },
];

// When ANY service is added to an inspection after creation, billing + agreement
// aren't the whole picture — the inspection record and the service's deliverable
// have to reflect it too. This:
//   1. records the service on inspections.services (so every record/receipt/
//      display shows what was actually sold), and
//   2. for a flag-gated service (mold/radon/drone), flips the flag so its report
//      section lights up in the builder + client portal + client report.
//
// POST { inspectionId, service }  (service = the add-on's name)
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id;
    const rawService = String(body.service || body.serviceName || "").trim();
    const service = rawService.toLowerCase();
    const price = Number(String(body.price ?? "").replace(/[^0-9.]/g, ""));

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(
      admin,
      user.id,
      inspectionId,
      "id, mold, radon, drone, services, inspection_type, service_mode, service_fees, invoice_amount, price, fee",
    );
    if (!authorized) return notFound("Inspection not found.");

    const insp: any = authorized;
    const update: Record<string, any> = {};
    const enabled: string[] = [];

    // 1) Flip any flag-gated deliverable for this service.
    for (const svc of FLAG_SERVICES) {
      if (svc.match.test(service) && insp[svc.flag] !== true) {
        update[svc.flag] = true;
        if (svc.showsSection) enabled.push(svc.label);
      }
    }

    // 2) Record the service on the inspection (so the record shows everything
    //    sold), unless it's clearly already listed.
    let recorded = false;
    if (rawService) {
      const existing = String(insp.services || "").trim();
      const haystack = `${existing} ${String(insp.inspection_type || "")}`.toLowerCase();
      if (!haystack.includes(service)) {
        update.services = existing ? `${existing}, ${rawService}` : rawService;
        recorded = true;
      }
    }

    // 3) Record the add-on's PRICE in the per-service fee map, so its agreement
    //    shows its OWN fee instead of falling back to the inspection total (the
    //    home price). The add-on is billed on a SEPARATE invoice, so its price is
    //    never in service_fees otherwise — that's the "wrong price on the mold
    //    agreement" bug. Seed the base service's fee from the total first (if the
    //    map is empty) so deriveServiceFees doesn't later subtract the add-on.
    if (Number.isFinite(price) && price > 0 && rawService) {
      const fees: Record<string, any> =
        insp.service_fees && typeof insp.service_fees === "object"
          ? { ...insp.service_fees }
          : {};
      if (Object.keys(fees).length === 0) {
        const baseKey = canonicalServiceKey(insp.service_mode || insp.inspection_type || "home");
        const total =
          Number(insp.invoice_amount ?? insp.price ?? insp.fee ?? 0) || 0;
        if (baseKey && total > 0) fees[baseKey] = total;
      }
      fees[canonicalServiceKey(rawService)] = price;
      update.service_fees = fees;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, enabled: [], recorded: false });
    }

    const { error } = await admin.from("inspections").update(update).eq("id", inspectionId);
    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not update the inspection for the added service." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, enabled, recorded });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not update the inspection for the added service." },
      { status: 500 },
    );
  }
}
