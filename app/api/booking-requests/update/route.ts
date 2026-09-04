
import { formatAppValue } from "../../../../lib/app-time";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrCreateShareToken } from "../../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const resend = new Resend(process.env.RESEND_API_KEY);

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

function getPropertyPhotoUrl(value: any) {
  const match = cleanText(value).match(/\[ON_POINT_PROPERTY_PHOTO:([^\]]+)\]/);
  return match?.[1]?.trim() || "";
}

function stripPropertyPhotoMarker(value: any) {
  return cleanText(value)
    .replace(/\[ON_POINT_PROPERTY_PHOTO:[^\]]+\]/g, "")
    .replace(/\[ON_POINT_ADDITIONAL_CLIENTS:[^\]]+\]/g, "")
    .trim();
}

function normalizeAdditionalClients(value: any) {
  const raw = Array.isArray(value) ? value : [];

  return raw
    .map((client: any) => ({
      name: cleanText(client?.name || client?.client_name),
      email: cleanText(client?.email || client?.client_email).toLowerCase(),
      phone: cleanText(client?.phone || client?.client_phone),
    }))
    .filter((client) => client.name || client.email || client.phone);
}

function getAdditionalClientsFromNotes(value: any) {
  const match = cleanText(value).match(/\[ON_POINT_ADDITIONAL_CLIENTS:([^\]]+)\]/);
  if (!match?.[1]) return [];

  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return normalizeAdditionalClients(parsed);
  } catch {
    return [];
  }
}

function getAdditionalClients(request: AnyRow) {
  return normalizeAdditionalClients(request.additional_clients || request.co_clients).concat(
    getAdditionalClientsFromNotes(request.notes)
  ).filter((client, index, array) => {
    const key = client.email || `${client.name}:${client.phone}`;
    return key && array.findIndex((item) => (item.email || `${item.name}:${item.phone}`) === key) === index;
  });
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
    additionalClients: getAdditionalClients(request),
  };
}

function getInspectionPayload(
  request: AnyRow,
  userId: string,
  companyId: string | number | null
) {
  const serviceType = requestedServices(request);
  const {
    clientName,
    clientEmail,
    clientPhone,
    realtorName,
    realtorEmail,
    realtorPhone,
    additionalClients,
  } = getContactValues(request);

  const address = cleanText(request.property_address);
  const squareFeet = cleanText(request.square_feet);

  // Price the requested add-ons, not just the home base, so a radon/mold
  // booking isn't saved at $0 and the mold/radon flags are set (audit M1).
  // Sample counts aren't known at booking time; the inspector adjusts later.
  const servicesText = serviceType.toLowerCase();
  const includesRadon = servicesText.includes("radon");
  const includesMold = servicesText.includes("mold");
  const includesHome =
    getNumber(squareFeet) > 0 ||
    servicesText.includes("home") ||
    servicesText.includes("buyer") ||
    servicesText.includes("full");

  const homeFee = includesHome ? calculatePriceFromSqft(squareFeet) : 0;
  const radonFee = includesRadon ? (includesHome ? 175 : 225) : 0;
  const moldFee = includesMold ? (includesHome ? 175 : 225) : 0;
  const calculatedPrice = homeFee + radonFee + moldFee;
  const propertyPhotoUrl =
    getPropertyPhotoUrl(request.notes) ||
    cleanText(request.property_image_url) ||
    cleanText(request.property_photo_url) ||
    cleanText(request.property_image);
  const cleanNotes = stripPropertyPhotoMarker(request.notes);
  const firstAdditionalClient = additionalClients[0] || null;

  return {
    inspector_id: userId,
    user_id: userId,
    owner_id: userId,
    created_by: userId,
    // Without this the inspection is invisible in Dispatch and to co-owners,
    // which filter by company_id (audit H7).
    company_id: companyId || null,

    radon: includesRadon,
    mold: includesMold,

    property_address: address,
    address,
    street: address,
    city: cleanText(request.city),
    state: cleanText(request.state).toUpperCase(),
    zip: cleanText(request.zip),
    zip_code: cleanText(request.zip),

    property_image: propertyPhotoUrl || null,
    property_image_url: propertyPhotoUrl || null,
    cover_photo_url: propertyPhotoUrl || null,
    photo_url: propertyPhotoUrl || null,
    image_url: propertyPhotoUrl || null,

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
    co_client_name: firstAdditionalClient?.name || null,
    co_client_email: firstAdditionalClient?.email || null,
    co_client_phone: firstAdditionalClient?.phone || null,
    secondary_client_name: firstAdditionalClient?.name || null,
    secondary_client_email: firstAdditionalClient?.email || null,
    secondary_client_phone: firstAdditionalClient?.phone || null,

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
    notes: cleanNotes || null,
    internal_notes: cleanNotes || null,

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
    additionalClients,
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

  for (const additionalClient of additionalClients) {
    if (!additionalClient.name || !additionalClient.email) continue;

    contactPayloads.push({
      inspection_id: inspectionId,
      inspector_id: inspectorId,
      name: additionalClient.name,
      email: additionalClient.email,
      phone: additionalClient.phone || null,
      role: "co-client",
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

function getBaseUrl(request: Request) {
  const envUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL;

  if (envUrl) {
    return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
  }

  return new URL(request.url).origin;
}

function formatDate(value: any) {
  if (!value) return "Date to be confirmed";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return cleanText(value);

  return formatAppValue(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: any) {
  const clean = cleanText(value);
  if (!clean) return "Time to be confirmed";

  const [hoursRaw, minutesRaw] = clean.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number((minutesRaw || "00").slice(0, 2));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return clean;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return formatAppValue(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function escapeHtml(value: any) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendAppointmentConfirmedEmails(
  admin: any,
  bookingRequest: AnyRow,
  inspectionId: string,
  request: Request
) {
  if (!process.env.RESEND_API_KEY) {
    return {
      sent: [],
      failed: [],
      skipped: true,
      reason: "Missing RESEND_API_KEY.",
    };
  }

  const contacts = await admin
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId);

  const rows = contacts?.data || [];
  const recipients: Array<{ email: string; name: string; role: string }> = rows
    .filter((contact: any) => {
      const role = cleanText(contact.role).toLowerCase();
      return (
        contact.email &&
        (role === "client" ||
          role === "co-client" ||
          role === "realtor" ||
          role === "transaction coordinator")
      );
    })
    .map((contact: any) => ({
      email: cleanText(contact.email).toLowerCase(),
      name: cleanText(contact.name),
      role: cleanText(contact.role).toLowerCase(),
    }));

  const uniqueRecipients: Array<{ email: string; name: string; role: string }> = Array.from(
    new Map(
      recipients.map((recipient: { email: string; name: string; role: string }) => [
        recipient.email,
        recipient,
      ])
    ).values()
  );

  if (uniqueRecipients.length === 0) {
    return { sent: [], failed: [], skipped: true, reason: "No contacts found." };
  }

  const address = [
    bookingRequest.property_address,
    bookingRequest.city,
    bookingRequest.state,
    bookingRequest.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const services = requestedServices(bookingRequest);
  const dateText = formatDate(bookingRequest.preferred_date);
  const timeText = formatTime(bookingRequest.preferred_time);

  const { data: inspectionForToken } = await admin
    .from("inspections")
    .select("id, company_id, public_share_token, share_token, report_share_token")
    .eq("id", inspectionId)
    .maybeSingle();

  const portalShareToken = inspectionForToken
    ? await getOrCreateShareToken(admin, inspectionForToken)
    : inspectionId;

  const portalUrl = `${getBaseUrl(request)}/client-portal/${portalShareToken}`;

  const branding = await getCompanyBrandingById(inspectionForToken?.company_id);

  const fromEmail = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <agreements@onpointhomeinspect.com>"
  );

  const sent: any[] = [];
  const failed: any[] = [];

  for (const recipient of uniqueRecipients) {
    const isRealtor =
      recipient.role.includes("realtor") || recipient.role.includes("transaction");

    const subject = `Inspection Confirmed - ${address || branding.name}`;

    const greeting = recipient.name ? `Hi ${escapeHtml(recipient.name)},` : "Hello,";

    const note = isRealtor
      ? "This confirms the inspection request has been accepted and scheduled."
      : "This confirms your inspection has been accepted and scheduled.";

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;padding:24px;">
        <h2 style="color:#0f766e;margin:0 0 16px;">${escapeHtml(branding.name)}</h2>

        <p>${greeting}</p>

        <p>${note}</p>

        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px;">
          <tr><td><strong>Property</strong></td><td>${escapeHtml(address)}</td></tr>
          <tr><td><strong>Date</strong></td><td>${escapeHtml(dateText)}</td></tr>
          <tr><td><strong>Time</strong></td><td>${escapeHtml(timeText)}</td></tr>
          <tr><td><strong>Services</strong></td><td>${escapeHtml(services)}</td></tr>
        </table>

        <p style="margin-top:18px;">
          Your inspection agreement and payment information may be sent separately if required.
        </p>

        <p>
          <a href="${portalUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
            Open Client Portal
          </a>
        </p>

        <p style="margin-top:30px;font-size:12px;color:#64748b;">
          ${escapeHtml(branding.name)}<br />
          ${escapeHtml(branding.tagline)}
        </p>
      </div>
    `;

    const text = `${recipient.name ? `Hi ${recipient.name},` : "Hello,"}

${isRealtor ? "This confirms the inspection request has been accepted and scheduled." : "This confirms your inspection has been accepted and scheduled."}

Property: ${address}
Date: ${dateText}
Time: ${timeText}
Services: ${services}

Your inspection agreement and payment information may be sent separately if required.

Client Portal:
${portalUrl}

${branding.name}`;

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        subject,
        html,
        text,
      });

      sent.push({
        email: recipient.email,
        role: recipient.role,
        resend_id: result?.data?.id || null,
      });

      await admin.from("email_logs").insert({
        inspection_id_bigint: Number(inspectionId),
        recipient: recipient.email,
        recipient_email: recipient.email,
        email_type: "appointment_confirmed",
        subject,
        message: portalUrl,
        status: "sent",
        resend_id: result?.data?.id || null,
        sent_at: new Date().toISOString(),
        metadata: {
          type: "appointment_confirmed",
          role: recipient.role,
          portalUrl,
        },
      });
    } catch (error: any) {
      failed.push({
        email: recipient.email,
        role: recipient.role,
        error: error?.message || "Failed to send appointment confirmation.",
      });

      await admin.from("email_logs").insert({
        inspection_id_bigint: Number(inspectionId),
        recipient: recipient.email,
        recipient_email: recipient.email,
        email_type: "appointment_confirmed",
        subject,
        message: portalUrl,
        status: "failed",
        resend_id: null,
        sent_at: null,
        metadata: {
          type: "appointment_confirmed",
          role: recipient.role,
          portalUrl,
          error: error?.message || "Failed to send appointment confirmation.",
        },
      });
    }
  }

  return { sent, failed, skipped: false };
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

    // Company scoping (audit H8): the admin read above bypasses the
    // booking_requests RLS, so only act on a request that belongs to the
    // caller's company or is still unclaimed (the shared pool). Otherwise an
    // inspector could confirm or decline another company's lead by guessing id.
    const { data: callerCompanies } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id);

    const callerCompanyIds = new Set(
      (callerCompanies || [])
        .map((row: any) => (row.company_id ? String(row.company_id) : ""))
        .filter(Boolean)
    );

    const reqCompanyId = bookingRequest.company_id
      ? String(bookingRequest.company_id)
      : "";
    const reqInspectorId = bookingRequest.inspector_id
      ? String(bookingRequest.inspector_id)
      : "";

    const canActOnRequest =
      (!reqCompanyId && !reqInspectorId) ||
      (reqCompanyId !== "" && callerCompanyIds.has(reqCompanyId)) ||
      reqInspectorId === String(user.id);

    if (!canActOnRequest) {
      return NextResponse.json(
        { error: "Booking request not found." },
        { status: 404 }
      );
    }

    const inspectionCompanyId =
      reqCompanyId || callerCompanies?.[0]?.company_id || null;

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
    // The real total actually saved on the inspection (add-on aware: home +
    // radon + mold), so the response reports the billed price rather than the
    // sqft-only base. Set when we build the payload below.
    let confirmedPrice: number | null = null;

    // Idempotency: a booking that's already confirmed (has its inspection) must
    // not re-run the side effects — otherwise a double-click / retry / re-accept
    // re-sends the "Inspection Confirmed" email to the client, co-clients, and
    // realtor. Return the existing state instead.
    if (bookingRequest.status === "confirmed" && inspectionId) {
      return NextResponse.json({
        ok: true,
        request: bookingRequest,
        alreadyConfirmed: true,
      });
    }

    if (!inspectionId) {
      const payload = getInspectionPayload(
        bookingRequest,
        user.id,
        inspectionCompanyId
      );
      confirmedPrice = (payload as any)?.price ?? null;

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

    const confirmationEmails = await sendAppointmentConfirmedEmails(
      admin,
      bookingRequest,
      String(inspectionId),
      request
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
      confirmationEmails,
      removedColumns,
      calculatedPrice:
        confirmedPrice != null
          ? confirmedPrice
          : calculatePriceFromSqft(bookingRequest.square_feet),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Booking request update failed." },
      { status: 500 }
    );
  }
}
