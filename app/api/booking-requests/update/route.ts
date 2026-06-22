import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRequest = Record<string, any>;

function requestedServices(request: BookingRequest) {
  if (Array.isArray(request.services_requested) && request.services_requested.length) {
    return request.services_requested.join(", ");
  }
  return request.service_type || "Buyer Home Inspection";
}

function getInspectionPayload(request: BookingRequest, userId: string) {
  const serviceType = requestedServices(request);

  return {
    inspector_id: userId,
    user_id: userId,
    property_address: request.property_address,
    address: request.property_address,
    city: request.city,
    state: request.state,
    zip: request.zip,
    square_feet: request.square_feet || null,
    client_name: request.client_name || request.requester_name,
    client_email: request.client_email || request.requester_email,
    client_phone: request.client_phone || request.requester_phone,
    realtor_name: request.realtor_name || (request.requester_role?.toLowerCase?.().includes("realtor") ? request.requester_name : null),
    realtor_email: request.realtor_email || (request.requester_role?.toLowerCase?.().includes("realtor") ? request.requester_email : null),
    realtor_phone: request.realtor_phone || (request.requester_role?.toLowerCase?.().includes("realtor") ? request.requester_phone : null),
    inspection_type: serviceType,
    service_type: serviceType,
    inspection_date: request.preferred_date,
    inspection_time: request.preferred_time || "10:00",
    status: "Scheduled",
    source: "booking_request",
    booking_request_id: request.id,
    notes: request.notes || null,
  };
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

    const { data: bookingRequest, error: readError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (readError || !bookingRequest) {
      return NextResponse.json({ error: readError?.message || "Booking request not found." }, { status: 404 });
    }

    if (action === "decline") {
      const { data, error } = await supabase
        .from("booking_requests")
        .update({ status: "declined", reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, request: data });
    }

    let inspectionId = bookingRequest.inspection_id || null;

    if (!inspectionId) {
      const payload = getInspectionPayload(bookingRequest, user.id);
      const { data: inspection, error: insertError } = await supabase
        .from("inspections")
        .insert(payload)
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message, attemptedPayload: payload }, { status: 500 });
      }

      inspectionId = inspection.id;
    }

    const { data: updatedRequest, error: updateError } = await supabase
      .from("booking_requests")
      .update({
        status: "confirmed",
        inspection_id: inspectionId,
        inspector_id: user.id,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, request: updatedRequest, inspectionId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Booking request update failed." }, { status: 500 });
  }
}
