import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

async function logEmailEvent(
  supabase: any,
  {
    inspectionId,
    recipient,
    subject,
    status,
    resendId,
    metadata = {},
  }: {
    inspectionId: any;
    recipient: string;
    subject: string;
    status: "sent" | "failed";
    resendId?: string | null;
    metadata?: Record<string, any>;
  }
) {
  try {
    await supabase.from("email_logs").insert({
      inspection_id: Number(inspectionId),
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "review_request",
      subject,
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });
  } catch (error) {
    console.error("Review request email log insert failed:", error);
  }
}

async function logAuditEvent(
  supabase: any,
  {
    userId,
    inspectionId,
    recipient,
  }: {
    userId: string;
    inspectionId: any;
    recipient: string;
  }
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "review_request_sent",
      resource_type: "inspection",
      resource_id: String(inspectionId),
      metadata: {
        recipient,
      },
    });
  } catch (error) {
    console.error("Review request audit log insert failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { inspectionId, recipientEmail } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const googleReviewUrl =
      process.env.GOOGLE_REVIEW_URL ||
      process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
      "";

    if (!googleReviewUrl) {
      return NextResponse.json(
        {
          error:
            "Missing GOOGLE_REVIEW_URL. Add your Google review link to Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    let contactEmail = String(recipientEmail || "").trim();

    if (!contactEmail) {
      const { data: contacts } = await supabase
        .from("inspection_contacts")
        .select("email, role")
        .eq("inspection_id", inspectionId);

      const clientContact = (contacts || []).find((item: any) => {
        const role = String(item.role || "").toLowerCase();
        return ["client", "co-client"].includes(role) && item.email;
      });

      contactEmail =
        clientContact?.email ||
        inspection.client_email ||
        inspection.email ||
        "";
    }

    if (!contactEmail) {
      return NextResponse.json(
        { error: "No client email found for this inspection." },
        { status: 400 }
      );
    }

    const property =
      inspection.property_address ||
      inspection.address ||
      "your inspected property";

    const clientName =
      inspection.client_name ||
      inspection.client ||
      "there";

    const subject = `Thank you for choosing On Point Home Inspections`;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
        <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
          <h1 style="color:#2dd4bf; margin-top:0;">On Point Home Inspections</h1>

          <p>Hello ${escapeHtml(clientName)},</p>

          <p style="line-height:1.6;">
            Thank you for choosing On Point Home Inspections for:
          </p>

          <p style="font-size:18px; font-weight:bold; color:#ffffff;">
            ${escapeHtml(property)}
          </p>

          <p style="line-height:1.6;">
            If you were happy with your inspection experience, would you mind leaving a quick Google review?
            Reviews help other homeowners and real estate professionals find a reliable inspector.
          </p>

          <p style="margin:24px 0;">
            <a href="${escapeHtml(
              googleReviewUrl
            )}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
              Leave a Google Review
            </a>
          </p>

          <p style="color:#cbd5e1; line-height:1.6;">
            I appreciate your business and the opportunity to help protect your investment.
          </p>

          <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />

          <p style="color:#94a3b8; font-size:14px;">
            On Point Home Inspections LLC<br />
            Protecting Your Investment. One Inspection at a Time.
          </p>
        </div>
      </div>
    `;

    const from =
      process.env.REVIEW_EMAIL_FROM ||
      process.env.REPORT_EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <reports@onpointhomeinspect.com>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: contactEmail,
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      await logEmailEvent(supabase, {
        inspectionId,
        recipient: contactEmail,
        subject,
        status: "failed",
        metadata: {
          type: "review_request",
          error: resendData?.message || "Review request failed to send.",
          resendData,
        },
      });

      return NextResponse.json(
        {
          error: resendData?.message || "Review request failed to send.",
        },
        { status: 500 }
      );
    }

    await supabase
      .from("inspections")
      .update({
        review_status: "Requested",
      })
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    await logEmailEvent(supabase, {
      inspectionId,
      recipient: contactEmail,
      subject,
      status: "sent",
      resendId: resendData?.id || null,
      metadata: {
        type: "review_request",
        googleReviewUrl,
      },
    });

    await logAuditEvent(supabase, {
      userId: user.id,
      inspectionId,
      recipient: contactEmail,
    });

    return NextResponse.json({
      success: true,
      message: `Review request sent to ${contactEmail}.`,
    });
  } catch (error: any) {
    console.error("Send review request error:", error);

    return NextResponse.json(
      { error: error?.message || "Review request failed to send." },
      { status: 500 }
    );
  }
}
