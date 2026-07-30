import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveTeamInspectorIds } from "../../../lib/inspectionAccess";

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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teamIds = await resolveTeamInspectorIds(supabase, user.id);

    const { data, error } = await supabase
      .from("realtors")
      .select("*")
      .in("inspector_id", teamIds)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ realtors: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load realtors." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const lastContactDate = String(body.last_contact_date || "");

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("realtors")
      .insert({
        inspector_id: user.id,
        name,
        email: email || null,
        phone: phone || null,
        last_contact_date: lastContactDate || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ realtor: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save realtor." },
      { status: 500 }
    );
  }
}
