import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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

export async function POST(req: Request) {
  try {
    const { inspectionId, recipientType, recipientEmail } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
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

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (error || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const finalRecipient =
      recipientEmail ||
      (recipientType === "client"
        ? inspection.client_email
        : inspection.realtor_email || inspection.agent_email);

    if (!finalRecipient) {
      return NextResponse.json(
        { error: "No recipient email found." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const finalShareUrl = `${appUrl}/share/${inspectionId}`;

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    const subject = `Inspection Report Ready - ${property}`;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
        <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
          <h1 style="color:#2dd4bf; margin-top:0;">On Point Home Inspections</h1>

          <p>Hello,</p>

          <p>Your inspection report for:</p>

          <p style="font-size:18px; font-weight:bold; color:#ffffff;">
            ${property}
          </p>

          <p>is ready to review.</p>

          <p>
            <a href="${finalShareUrl}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
              View Inspection Report
            </a>
          </p>

          <p style="color:#cbd5e1; line-height:1.6;">
            This report is based on a visual, non-invasive inspection of readily accessible systems and components at the time of inspection.
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
        to: finalRecipient,
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return NextResponse.json(
        {
          error:
            resendData?.message ||
            "Email failed to send. Check Resend settings.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Report email sent to ${finalRecipient}.`,
      shareUrl: finalShareUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Email failed to send." },
      { status: 500 }
    );
  }
}