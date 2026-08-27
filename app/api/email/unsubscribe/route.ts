import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "../../../../lib/emailUnsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function recordUnsubscribe(email: string, source: string) {
  try {
    await admin.from("email_unsubscribes").upsert(
      { email: email.toLowerCase().trim(), unsubscribed_at: new Date().toISOString(), source },
      { onConflict: "email" },
    );
  } catch (e) {
    console.error("[unsubscribe] record error", e);
  }
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="margin:0;background:#020617;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:14vh auto;padding:32px 24px;text-align:center;">
<div style="font-size:12px;font-weight:800;letter-spacing:.24em;color:#14c8d2;text-transform:uppercase;">On Point Home Inspections</div>
<h1 style="margin:16px 0 8px;font-size:22px;">${title}</h1>
<p style="color:#94a3b8;line-height:1.6;font-size:15px;">${body}</p>
</div></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

// RFC 8058 one-click: the recipient's mail client POSTs here directly (no page).
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const email = verifyUnsubscribeToken(token);
  if (!email) return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  await recordUnsubscribe(email, "one-click");
  return NextResponse.json({ ok: true });
}

// Browser click: verify, record, and show a friendly confirmation page.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return page("Link not valid", "This unsubscribe link is invalid or has expired. No changes were made.", 400);
  }
  await recordUnsubscribe(email, "link");
  return page(
    "You're unsubscribed",
    `<strong style="color:#f8fafc;">${email}</strong> will no longer receive reminder emails from us. You'll still receive anything you specifically request, like an inspection report you're expecting.`,
  );
}
