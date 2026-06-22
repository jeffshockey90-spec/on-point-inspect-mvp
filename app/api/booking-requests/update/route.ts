import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRequest = Record<string, any>;
type InsertAttempt = { payload: Record<string, any>; label: string };

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

function cleanText(value: any) {
  return String(value || "").trim();
}

function requestedServices(request: BookingRequest) {
  if (Array.isArray(request.services_requested) && request.services_requested.length) {
    return request.services_requested.map(cleanText).filter(Boolean).join(", ");
  }

  return cleanText(request.service_type) || "Buyer Home Inspection";
}

function realtorFallback(request: BookingRequest, field: "name" | "email" | "phone") {
  const role = cleanText(request.requester_role).toLowerCase();
  if (!role.includes("realtor") && !role.includes("agent")) return null;

  if (field === "name") return cleanText(request.requester_name) || null;
  if (field === "email") return cleanText(request.requester_email).toLowerCase() || null;
  return cleanText(request.requester_phone) || null;
}

function getFullPayload(request: BookingRequest, userId: string) {
  const serviceType = requestedServices(request);
  const address = cleanText(request.property_address);
  const city = cleanText(request.city);
  const state = cleanText(request.state).toUpperCase();
  const zip = cleanText(request.zip);
  const notes = cleanText(request.notes);

  return {
    inspector_id: userId,
    user_id: userId,
    owner_id: userId,
    property_address: address,
    address,
    city,
    state,
    zip,
    zip_code: zip,
    square_feet: cleanText(request.square_feet) || null,
    sqft: cleanText(request.square_feet) || null,
    client_name: cleanText(request.client_name) || cleanText(request.requester_name),
    client_email: cleanText(request.client_email).toLowerCase() || cleanText(request.requester_email).toLowerCase(),
    client_phone: cleanText(request.client_phone) || cleanText(request.requester_phone),
    realtor_name: cleanText(request.realtor_name) || realtorFallback(request, "name"),
    realtor_email: cleanText(request.realtor_email).toLowerCase() || realtorFallback(request, "email"),
    realtor_phone: cleanText(request.realtor_phone) || realtorFallback(request, "phone"),
    agent_name: cleanText(request.realtor_name) || realtorFallback(request, "name"),
    agent_email: cleanText(request.realtor_email).toLowerCase() || realtorFallback(request, "email"),
    agent_phone: cleanText(request.realtor_phone) || realtorFallback(request, "phone"),
    inspection_type: serviceType,
    service_type: serviceType,
    type: serviceType,
    inspection_date: cleanText(request.preferred_date),
    scheduled_date: cleanText(request.preferred_date),
    inspection_time: cleanText(request.preferred_time) || "10:00",
    scheduled_time: cleanText(request.preferred_time) || "10:00",
    status: "Scheduled",
    inspection_status: "Scheduled",
    source: "booking_request",
    booking_request_id: request.id,
    notes: notes || null,
    inspector_notes: notes ? `Booking request notes: ${notes}` : null,
  };
}

function pick(payload: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  keys.forEach((key) => {
    if (payload[key] !== undefined) out[key] = payload[key];
  });
  return out;
}

function buildInsertAttempts(full: Record<string, any>): InsertAttempt[] {
  return [
    { label: "full payload", payload: full },
    {
      label: "common On Point schema",
      payload: pick(full, [
        "inspector_id",
        "user_id",
        "property_address",
        "address",
        "city",
        "state",
        "zip",
        "square_feet",
        "client_name",
        "client_email",
        "client_phone",
        "realtor_name",
        "realtor_email",
        "realtor_phone",
        "inspection_type",
        "service_type",
        "inspection_date",
        "inspection_time",
        "status",
        "source",
        "booking_request_id",
        "notes",
      ]),
    },
    {
      label: "legacy schedule schema",
      payload: pick(full, [
        "inspector_id",
        "user_id",
        "property_address",
        "city",
        "state",
        "zip",
        "client_name",
        "client_email",
        "client_phone",
        "realtor_name",
        "realtor_email",
        "inspection_type",
        "inspection_date",
        "inspection_time",
        "status",
        "notes",
      ]),
    },
    {
      label: "minimal schema",
      payload: pick(full, [
        "inspector_id",
        "user_id",
        "property_address",
        "client_name",
        "client_email",
        "client_phone",
        "inspection_type",
        "inspection_date",
        "inspection_time",
        "status",
      ]),
    },
  ];
}

async function createInspection(admin: any, bookingRequest: BookingRequest, userId: string) {
  const fullPayload = getFullPayload(bookingRequest, userId);
  const attempts = buildInsertAttempts(fullPayload);
  const errors: string[] = [];

  for (const attempt of attempts) {
    const { data, error } = await admin
      .from("inspections")
      .insert(attempt.payload)
      .select("*")
      .single();

    if (!error && data) {
      return { inspection: data, payload: attempt.payload, label: attempt.label };
    }

    errors.push(`${attempt.label}: ${error?.message || "Unknown insert error"}`);
  }

  throw new Error(`Inspection could not be created. ${errors.join(" | ")}`);
}

async function updateBookingRequest(admin: any, requestId: string, payload: Record<string, any>) {
  const { data, error } = await admin
    .from("booking_requests")
    .update(payload)
    .eq("id", requestId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestId = body.requestId;
    const action = String(body.action || "").toLowerCase();

    if (!requestId || !["confirm", "decline"].includes(action)) {
      return NextResponse.json({ error: "Missing requestId or valid action." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: bookingRequest, error: readError } = await admin
      .from("booking_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (readError || !bookingRequest) {
      return NextResponse.json({ error: readError?.message || "Booking request not found." }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "decline") {
      const updated = await updateBookingRequest(admin, requestId, {
        status: "declined",
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      });

      return NextResponse.json({ ok: true, request: updated });
    }

    let inspectionId = bookingRequest.inspection_id || null;
    let createdInspection: any = null;
    let insertLabel = "existing inspection";

    if (!inspectionId) {
      const created = await createInspection(admin, bookingRequest, user.id);
      createdInspection = created.inspection;
      inspectionId = created.inspection.id;
      insertLabel = created.label;
    }

    const updatedRequest = await updateBookingRequest(admin, requestId, {
      status: "confirmed",
      inspection_id: inspectionId,
      inspector_id: user.id,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });

    return NextResponse.json({
      ok: true,
      request: updatedRequest,
      inspection: createdInspection,
      inspectionId,
      insertLabel,
    });
  } catch (error: any) {
    console.error("Booking request update failed:", error);

    return NextResponse.json(
      { error: error?.message || "Booking request update failed." },
      { status: 500 }
    );
  }
}
