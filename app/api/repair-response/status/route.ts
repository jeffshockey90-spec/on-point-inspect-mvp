import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { notFound, authorizeInspection } from "../../../../lib/apiAuth";

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

function createDatabaseClient(fallbackClient: any) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return fallbackClient;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = url.searchParams.get("inspectionId") || url.searchParams.get("inspection_id");

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const db = createDatabaseClient(authClient);

    // Authorize: the signed-in user must own (or be the company owner of) this
    // inspection before its repair-request shares/responses are returned.
    const authorized = await authorizeInspection(db, user.id, Number(inspectionId), "id");
    if (!authorized) return notFound();

    const { data: shares, error: sharesError } = await db
      .from("repair_request_shares")
      .select("id, inspection_id, recipient_email, recipient_type, status, created_at, responded_at")
      .eq("inspection_id", Number(inspectionId))
      .order("created_at", { ascending: false });

    if (sharesError) {
      return NextResponse.json({ error: sharesError.message }, { status: 500 });
    }

    const shareIds = (shares || []).map((share: any) => share.id);
    let responses: any[] = [];

    if (shareIds.length) {
      const { data: responsesRaw, error: responsesError } = await db
        .from("repair_request_responses")
        .select("*")
        .in("share_id", shareIds)
        .order("updated_at", { ascending: false });

      if (responsesError) {
        return NextResponse.json({ error: responsesError.message }, { status: 500 });
      }

      responses = responsesRaw || [];
    }

    return NextResponse.json({
      success: true,
      shares: shares || [],
      responses,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load repair request status." },
      { status: 500 }
    );
  }
}
