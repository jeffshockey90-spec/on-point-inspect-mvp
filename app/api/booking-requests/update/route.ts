import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function cleanText(value: any) {
  return String(value || "").trim();
}

function requestedServices(request: AnyRow) {
  if (
    Array.isArray(request.services_requested) &&
    request.services_requested.length
  ) {
    return request.services_requested
      .map((service: any) => cleanText(service))
      .filter(Boolean)
      .join(", ");
  }

  return cleanText(request.service_type) || "Buyer Home Inspection";
}

function requesterIsRealtor(request: AnyRow) {
  return cleanText(request.requester_role).toLowerCase().includes("realtor");
}

function getInspectionPayload(request: AnyRow, userId: string) {
  const serviceType = requestedServices(request);
  const clientName =
    cleanText(request.client_name) || cleanText(request.requester_name);
  const clientEmail =
    cleanText(request.client_email) || cleanText(request.requester_email);
  const clientPhone =
    cleanText(request.client_phone) || cleanText(request.requester_phone);

  const realtorName =
    cleanText(request.realtor_name) ||
    (requesterIsRealtor(request) ? cleanText(request.requester_name) : "");

  const realtorEmail =
    cleanText(request.realtor_email) ||
    (requesterIsRealtor(request) ? cleanText(request.requester_email) : "");

  const realtorPhone =
    cleanText(request.realtor_phone) ||
    (requesterIsRealtor(request) ? cleanText(request.requester_phone) : "");

  const address = cleanText(request.property_address);

  /*
    This payload intentionally includes multiple common column names because
    different On Point Inspect builds have used slightly different inspection
    schema names. The insert helper below removes unsupported columns if the
    Supabase schema cache says they do not exist.
  */
  return {
    inspector_id: userId,
    user_id: userId,
    owner_id: userId,
    created_by: userId,

    property_address: address,
    address,
    street: address,
    city: cleanText(request.city),
    state: cleanText(request.state).toUpperCase(),
    zip: cleanText(request.zip),
    zip_code: cleanText(request.zip),

    square_feet: cleanText(request.square_feet) || null,
    sqft: cleanText(request.square_feet) || null,

    client_name: clientName,
    client_email: clientEmail,
    client_phone: clientPhone,
    buyer_name: clientName,
    customer_name: clientName,
    customer_email: clientEmail,
    customer_phone: clientPhone,

    realtor_name: realtorName || null,
    realtor_email: realtorEmail || null,
    realtor_phone: realtorPhone || null,
    agent_name: realtorName || null,
    agent_email: realtorEmail || null,
    agent_phone: realtorPhone || null,

    inspection_type: serviceType,
    service_type: serviceType,
    type: serviceType,

    inspection_date: cleanText(request.preferred_date),
    scheduled_date: cleanText(request.preferred_date),
    date: cleanText(request.preferred_date),
    inspection_time: cleanText(request.preferred_time) || "10:00",
    scheduled_time: cleanText(request.preferred_time) || "10:00",
    time: cleanText(request.preferred_time) || "10:00",

    status: "Scheduled",
    inspection_status: "Scheduled",
    report_status: "draft",

    source: "booking_request",
    booking_request_id: request.id,
    notes: cleanText(request.notes) || null,
    internal_notes: cleanText(request.notes) || null,

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getMissingColumnName(error: any) {
  const text = String(
    error?.message ||
      error?.details ||
      error?.hint ||
      error?.code ||
      ""
  );

  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /record "([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

async function insertInspectionWithSchemaFallback(
  supabase: any,
  initialPayload: AnyRow
) {
  let payload = { ...initialPayload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = await supabase
      .from("inspections")
      .insert(payload)
      .select("*")
      .single();

    if (!error) {
      return { inspection: data, removedColumns };
    }

    const missingColumn = getMissingColumnName(error);

    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      delete payload[missingColumn];
      removedColumns.push(missingColumn);
      continue;
    }

    throw {
      error,
      attemptedPayload: payload,
      removedColumns,
    };
  }

  throw {
    error: new Error("Could not create inspection after removing unsupported columns."),
    attemptedPayload: payload,
    removedColumns,
  };
}

function compactUpdatePayload(payload: AnyRow) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestId = body.requestId;
    const action = cleanText(body.action).toLowerCase();

    if (!requestId || !["confirm", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "Missing requestId or valid action." },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: readError?.message || "Booking request not found." },
        { status: 404 }
      );
    }

    if (action === "decline") {
      const { data, error } = await supabase
        .from("booking_requests")
        .update(
          compactUpdatePayload({
            status: "declined",
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        )
        .eq("id", requestId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, request: data });
    }

    let inspectionId = bookingRequest.inspection_id || null;
    let removedColumns: string[] = [];

    if (!inspectionId) {
      const payload = getInspectionPayload(bookingRequest, user.id);

      try {
        const result = await insertInspectionWithSchemaFallback(
          supabase,
          payload
        );

        inspectionId = result.inspection?.id;
        removedColumns = result.removedColumns;
      } catch (insertFailure: any) {
        return NextResponse.json(
          {
            error:
              insertFailure?.error?.message ||
              insertFailure?.message ||
              "Inspection could not be created.",
            attemptedPayload: insertFailure?.attemptedPayload || payload,
            removedColumns: insertFailure?.removedColumns || [],
          },
          { status: 500 }
        );
      }
    }

    const { data: updatedRequest, error: updateError } = await supabase
      .from("booking_requests")
      .update(
        compactUpdatePayload({
          status: "confirmed",
          inspection_id: inspectionId,
          inspector_id: user.id,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      )
      .eq("id", requestId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, inspectionId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      request: updatedRequest,
      inspectionId,
      removedColumns,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Booking request update failed." },
      { status: 500 }
    );
  }
}
