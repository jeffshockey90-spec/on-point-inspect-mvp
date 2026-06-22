import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

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

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
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

function getContactValues(request: AnyRow) {
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

  return {
    clientName,
    clientEmail,
    clientPhone,
    realtorName,
    realtorEmail,
    realtorPhone,
  };
}

function getInspectionPayload(request: AnyRow, userId: string) {
  const serviceType = requestedServices(request);
  const {
    clientName,
    clientEmail,
    clientPhone,
    realtorName,
    realtorEmail,
    realtorPhone,
  } = getContactValues(request);

  const address = cleanText(request.property_address);
  const squareFeet = cleanText(request.square_feet);
  const calculatedPrice = calculatePriceFromSqft(squareFeet);

  /*
    This payload intentionally includes multiple common column names because
    different On Point Inspect builds have used slightly different inspection
    schema names. The insert helper below removes unsupported columns if the
    Supabase schema cache says they do not exist.

    Pricing is calculated from estimated square footage for the inspector/report
    side only. The public booking page does not show the price.
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

    square_feet: squareFeet || null,
    sqft: squareFeet || null,

    price: calculatedPrice || null,
    invoice_amount: calculatedPrice || null,
    total_price: calculatedPrice || null,
    total: calculatedPrice || null,
    inspection_price: calculatedPrice || null,
    inspection_fee: calculatedPrice || null,
    quote_amount: calculatedPrice || null,
    quoted_price: calculatedPrice || null,
    subtotal: calculatedPrice || null,
    balance_due: calculatedPrice || null,
    amount_paid: 0,
    payment_status: calculatedPrice ? "unpaid" : null,
    invoice_status: calculatedPrice ? "unpaid" : null,

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

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { data, error } = await supabase
      .from("inspections")
      .insert(payload)
      .select("*")
      .single();

    if (!error) {
      return { inspection: data, removedColumns };
    }

    const missingColumn = getMissingColumnName(error);

    if (
      missingColumn &&
      Object.prototype.hasOwnProperty.call(payload, missingColumn)
    ) {
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
    error: new Error(
      "Could not create inspection after removing unsupported columns."
    ),
    attemptedPayload: payload,
    removedColumns,
  };
}

async function upsertBookingContacts(
  admin: any,
  bookingRequest: AnyRow,
  inspectionId: string,
  inspectorId: string
) {
  const {
    clientName,
    clientEmail,
    clientPhone,
    realtorName,
    realtorEmail,
    realtorPhone,
  } = getContactValues(bookingRequest);

  const contactPayloads: AnyRow[] = [];

  if (clientName && clientEmail) {
    contactPayloads.push({
      inspection_id: inspectionId,
      inspector_id: inspectorId,
      name: clientName,
      email: clientEmail,
      phone: clientPhone || null,
      role: "client",
      agreement_required: true,
      portal_access: true,
      updated_at: new Date().toISOString(),
    });
  }

  if (realtorName && realtorEmail) {
    contactPayloads.push({
      inspection_id: inspectionId,
      inspector_id: inspectorId,
      name: realtorName,
      email: realtorEmail,
      phone: realtorPhone || null,
      role: "realtor",
      agreement_required: false,
      portal_access: true,
      updated_at: new Date().toISOString(),
    });
  }

  if (contactPayloads.length === 0) {
    return { inserted: 0, skipped: true };
  }

  let inserted = 0;
  const errors: string[] = [];

  for (const contact of contactPayloads) {
    const { data: existing, error: existingError } = await admin
      .from("inspection_contacts")
      .select("id")
      .eq("inspection_id", inspectionId)
      .eq("email", contact.email)
      .maybeSingle();

    if (existingError) {
      errors.push(existingError.message);
      continue;
    }

    if (existing?.id) {
      const { error: updateError } = await admin
        .from("inspection_contacts")
        .update(contact)
        .eq("id", existing.id);

      if (updateError) {
        errors.push(updateError.message);
      }

      continue;
    }

    const { error: insertError } = await admin
      .from("inspection_contacts")
      .insert(contact);

    if (insertError) {
      errors.push(insertError.message);
      continue;
    }

    inserted += 1;
  }

  return { inserted, skipped: false, errors };
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

    const admin = createAdminClient();

    const { data: bookingRequest, error: readError } = await admin
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
      const { data, error } = await admin
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
          admin,
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

    const contacts = await upsertBookingContacts(
      admin,
      bookingRequest,
      String(inspectionId),
      user.id
    );

    const { data: updatedRequest, error: updateError } = await admin
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
      contacts,
      removedColumns,
      calculatedPrice: calculatePriceFromSqft(bookingRequest.square_feet),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Booking request update failed." },
      { status: 500 }
    );
  }
}
