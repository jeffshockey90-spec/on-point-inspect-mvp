import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { encryptSecret, decryptSecret } from "../../../../lib/secretCrypto";
import { verifySmtp } from "../../../../lib/companyEmailSmtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the caller's saved SMTP settings WITHOUT the password (only whether one
// is set). RLS scopes to the caller's own row.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data } = await supabase
    .from("inspector_email_settings")
    .select("enabled, smtp_host, smtp_port, smtp_user, from_name, smtp_pass_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: !!data?.enabled,
    host: data?.smtp_host || "",
    port: data?.smtp_port || 465,
    user: data?.smtp_user || "",
    fromName: data?.from_name || "",
    hasPassword: !!data?.smtp_pass_encrypted,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}) as any);
  const host = String(body.host || "").trim();
  const port = Number(body.port || 465) || 465;
  const smtpUser = String(body.user || "").trim();
  const fromName = String(body.fromName || "").trim();
  const passInput = typeof body.pass === "string" ? body.pass : "";

  const { data: existing } = await supabase
    .from("inspector_email_settings")
    .select("smtp_pass_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  const resolvedPass = passInput || (existing?.smtp_pass_encrypted ? decryptSecret(existing.smtp_pass_encrypted) : "");

  // Test the connection without saving.
  if (body.test) {
    if (!host || !smtpUser || !resolvedPass) {
      return NextResponse.json({ ok: false, error: "Enter the server, username, and password first." });
    }
    const result = await verifySmtp({ host, port, user: smtpUser, pass: resolvedPass, fromEmail: smtpUser });
    return NextResponse.json(result);
  }

  // Save.
  const enabled = !!body.enabled;
  const encryptedPass = passInput ? encryptSecret(passInput) : existing?.smtp_pass_encrypted || null;
  if (enabled && (!host || !smtpUser || !encryptedPass)) {
    return NextResponse.json(
      { error: "Server, username, and password are all required to turn this on." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("inspector_email_settings").upsert(
    {
      user_id: user.id,
      enabled,
      smtp_host: host || null,
      smtp_port: port,
      smtp_user: smtpUser || null,
      smtp_pass_encrypted: encryptedPass,
      from_name: fromName || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
