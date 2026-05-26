import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const item = await req.json();

    if (!item?.type) {
      return NextResponse.json(
        { error: "Missing offline queue item type." },
        { status: 400 }
      );
    }

    if (item.type === "finding") {
      const payload = item.payload || {};

      if (!payload.inspection_id) {
        return NextResponse.json(
          { error: "Missing inspection_id." },
          { status: 400 }
        );
      }

      if (!payload.title) {
        return NextResponse.json(
          { error: "Missing finding title." },
          { status: 400 }
        );
      }

      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: payload.inspection_id,
          title: payload.title,
          section: payload.section || "Exterior",
          severity: payload.severity || "Recommended Repair",
          observation: payload.observation || "",
          implication: payload.implication || "",
          recommendation: payload.recommendation || "",
          image_url: payload.image_url || null,
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        synced: true,
        type: "finding",
        finding,
      });
    }

    return NextResponse.json(
      { error: `Unsupported offline item type: ${item.type}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Offline sync error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to sync offline item." },
      { status: 500 }
    );
  }
}
