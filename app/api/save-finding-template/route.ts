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
          } catch {
            // Route handlers can usually set cookies, but ignore if unavailable.
          }
        },
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not logged in." }, { status: 401 });
    }

    const body = await req.json();

    const title = String(body.title || "Untitled Finding").trim();
    const section = String(body.section || "Inspection Details").trim();
    const severity = String(body.severity || "Recommended Repair").trim();
    const observation = String(body.observation || "").trim();
    const implication = String(body.implication || "").trim();
    const recommendation = String(body.recommendation || "").trim();
    const tags = String(body.tags || "").trim();
    const isFavorite = Boolean(body.is_favorite ?? body.isFavorite ?? false);

    if (!title) {
      return NextResponse.json({ error: "Missing title." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("finding_templates")
      .insert({
        inspector_id: user.id,
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
        tags: tags || null,
        is_favorite: isFavorite,
        usage_count: 0,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, template: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save template." },
      { status: 500 }
    );
  }
}
