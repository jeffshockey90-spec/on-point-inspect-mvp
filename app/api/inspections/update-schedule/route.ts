import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inspectionId = body.inspectionId;
    const inspectionDate = body.inspection_date;
    const inspectionTime = body.inspection_time;
    const status = body.status;

    if (!inspectionId || !inspectionDate) {
      return NextResponse.json(
        { error: "Missing inspectionId or inspection_date" },
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

    const updatePayload: Record<string, any> = {
      inspection_date: inspectionDate,
      scheduled_date: inspectionDate,
      date: inspectionDate,
      inspection_time: inspectionTime || "09:00",
      scheduled_time: inspectionTime || "09:00",
      time: inspectionTime || "09:00",
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updatePayload.status = status;
      updatePayload.inspection_status = status;
    }

    const { error } = await supabase
      .from("inspections")
      .update(updatePayload)
      .eq("id", inspectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Schedule update failed" },
      { status: 500 }
    );
  }
}
