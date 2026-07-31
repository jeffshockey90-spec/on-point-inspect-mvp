import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAdminClient, authorizeInspection, notFound } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inspectionId = body.inspectionId;

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspectionId" },
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

    // Defense-in-depth: confirm this inspection belongs to the caller (or their
    // team, for company owners) before deleting. The RLS-scoped delete below is
    // still the primary gate; this returns a clean 404 for foreign ids instead
    // of relying solely on RLS silently affecting zero rows.
    const allowed = await authorizeInspection(getAdminClient(), user.id, inspectionId);

    if (!allowed) {
      return notFound("Inspection not found");
    }

    const { error } = await supabase
      .from("inspections")
      .delete()
      .eq("id", inspectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
