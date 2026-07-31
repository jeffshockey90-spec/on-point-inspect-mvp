import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

async function getUser() {
  const userClient = await createUserClient();

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getOrCreateSettings(admin: any, userId: string, userEmail: string) {
  const { data: existing, error } = await admin
    .from("schedule_reminder_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await admin
    .from("schedule_reminder_settings")
    .insert({
      user_id: userId,
      user_email: userEmail,
      enabled: true,
      reminder_24h_enabled: true,
      reminder_2h_enabled: true,
      reminder_30m_enabled: true,
      arrival_detection_enabled: true,
      departure_detection_enabled: true,
      geofence_radius_meters: 220,
      radon_reminders_enabled: true,
      radon_deployment_reminder_enabled: true,
      radon_retrieval_reminder_enabled: true,
    })
    .select("*")
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

export async function GET() {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createAdminClient();
    const settings = await getOrCreateSettings(
      admin,
      user.id,
      String(user.email || "").toLowerCase()
    );

    return NextResponse.json({
      ok: true,
      enabled: settings.enabled !== false,
      reminder_24h_enabled: settings.reminder_24h_enabled !== false,
      reminder_2h_enabled: settings.reminder_2h_enabled !== false,
      reminder_30m_enabled: settings.reminder_30m_enabled !== false,
      arrival_detection_enabled: settings.arrival_detection_enabled !== false,
      departure_detection_enabled: settings.departure_detection_enabled !== false,
      geofence_radius_meters: Number(settings.geofence_radius_meters || 220),
      radon_reminders_enabled: settings.radon_reminders_enabled !== false,
      radon_deployment_reminder_enabled:
        settings.radon_deployment_reminder_enabled !== false,
      radon_retrieval_reminder_enabled:
        settings.radon_retrieval_reminder_enabled !== false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const admin = createAdminClient();

    await getOrCreateSettings(
      admin,
      user.id,
      String(user.email || "").toLowerCase()
    );

    const radonDeploymentEnabled =
      body.radon_deployment_reminder_enabled !== false;
    const radonRetrievalEnabled =
      body.radon_retrieval_reminder_enabled !== false;

    const { data, error } = await admin
      .from("schedule_reminder_settings")
      .update({
        enabled: body.enabled !== false,
        reminder_24h_enabled: body.reminder_24h_enabled !== false,
        reminder_2h_enabled: body.reminder_2h_enabled !== false,
        reminder_30m_enabled: body.reminder_30m_enabled !== false,
        arrival_detection_enabled: body.arrival_detection_enabled !== false,
        departure_detection_enabled: body.departure_detection_enabled !== false,
        geofence_radius_meters: Math.min(1000, Math.max(100, Number(body.geofence_radius_meters || 220))),
        radon_deployment_reminder_enabled: radonDeploymentEnabled,
        radon_retrieval_reminder_enabled: radonRetrievalEnabled,
        // Legacy master flag still gates the native local-notification path;
        // keep it in sync so it's on when either granular reminder is on.
        radon_reminders_enabled: radonDeploymentEnabled || radonRetrievalEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      enabled: data.enabled !== false,
      reminder_24h_enabled: data.reminder_24h_enabled !== false,
      reminder_2h_enabled: data.reminder_2h_enabled !== false,
      reminder_30m_enabled: data.reminder_30m_enabled !== false,
      arrival_detection_enabled: data.arrival_detection_enabled !== false,
      departure_detection_enabled: data.departure_detection_enabled !== false,
      geofence_radius_meters: Number(data.geofence_radius_meters || 220),
      radon_reminders_enabled: data.radon_reminders_enabled !== false,
      radon_deployment_reminder_enabled:
        data.radon_deployment_reminder_enabled !== false,
      radon_retrieval_reminder_enabled:
        data.radon_retrieval_reminder_enabled !== false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save settings." },
      { status: 500 }
    );
  }
}
