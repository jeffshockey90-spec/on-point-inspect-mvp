import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { geocodeAddress, getDrivingDistance } from "../../../../lib/geocode";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

// Best-effort enrichment called right after an inspection is created - never
// blocks inspection creation itself if Google's APIs are slow or fail.
// Geocodes the property address (feeds the existing GPS mileage/geofencing
// system, which already reads property_latitude/longitude but never had
// anything populate them) and, if the company has a starting address set,
// caches the driving distance so the report page doesn't recompute it on
// every load.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId;

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = createAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const { data: inspection } = await admin
      .from("inspections")
      .select("id,company_id,property_address,address,city,state,zip")
      .eq("id", inspectionId)
      .maybeSingle();

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const fullAddress = [
      inspection.property_address || inspection.address,
      inspection.city,
      inspection.state,
      inspection.zip,
    ]
      .filter(Boolean)
      .join(", ");

    const propertyLocation = await geocodeAddress(fullAddress);

    if (!propertyLocation) {
      return NextResponse.json({ ok: true, geocoded: false });
    }

    const update: Record<string, any> = {
      property_latitude: propertyLocation.lat,
      property_longitude: propertyLocation.lng,
    };

    if (inspection.company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("office_address")
        .eq("id", inspection.company_id)
        .maybeSingle();

      if (company?.office_address) {
        // Use the office address text (same as the embedded map's origin)
        // rather than separately-geocoded coordinates, so the cached
        // mileage/time always matches what the map itself draws.
        const distance = await getDrivingDistance(company.office_address, fullAddress);

        if (distance) {
          update.distance_miles = distance.miles;
          update.drive_minutes = distance.minutes;
        }
      }
    }

    await admin.from("inspections").update(update).eq("id", inspectionId);

    return NextResponse.json({ ok: true, geocoded: true, ...update });
  } catch (error: any) {
    console.error("Enrich location error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to enrich inspection location." },
      { status: 500 }
    );
  }
}
