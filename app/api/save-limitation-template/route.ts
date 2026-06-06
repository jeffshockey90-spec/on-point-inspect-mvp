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
        setAll() {},
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const { title, limitationText } = await req.json();

    const cleanTitle = String(title || "").trim();
    const cleanText = String(limitationText || "").trim();

    if (!cleanTitle) {
      return NextResponse.json(
        { error: "Template title is required." },
        { status: 400 }
      );
    }

    if (!cleanText) {
      return NextResponse.json(
        { error: "Limitation text is required." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("limitation_templates")
      .insert({
        inspector_id: user.id,
        title: cleanTitle,
        limitation_text: cleanText,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, template: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save limitation template." },
      { status: 500 }
    );
  }
}
