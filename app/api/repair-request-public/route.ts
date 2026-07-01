import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.substring(index + marker.length));
}

function isRepairFinding(finding: any) {
  const section = String(finding?.section || "").toLowerCase();
  const title = String(finding?.title || "").toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;

  const excluded = [
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ];

  return !excluded.includes(title);
}

function safeInspectionForPublic(inspection: any) {
  if (!inspection) return null;

  return {
    id: inspection.id,
    property_address:
      inspection.property_address ||
      inspection.address ||
      inspection.street_address ||
      "",
    address:
      inspection.property_address ||
      inspection.address ||
      inspection.street_address ||
      "",
    client_name: inspection.client_name || inspection.client || "",
    realtor_name: inspection.realtor_name || inspection.agent_name || "",
    inspection_date: inspection.inspection_date || inspection.date || "",
    client_email: inspection.client_email || "",
    realtor_email: inspection.realtor_email || inspection.agent_email || "",
    agent_email: inspection.agent_email || "",
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = url.searchParams.get("inspection_id");

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 }
      );
    }

    const admin = createAdminClient();

    const { data: inspection, error: inspectionError } = await admin
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const { data: findingsRaw, error: findingsError } = await admin
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    if (findingsError) {
      console.error("Public repair request findings load failed:", findingsError);
      return NextResponse.json(
        { error: "Could not load repair request findings." },
        { status: 500 }
      );
    }

    const filteredFindings = (findingsRaw || []).filter(isRepairFinding);
    const findingIds = filteredFindings.map((finding: any) => finding.id);

    const { data: photosRaw } =
      findingIds.length > 0
        ? await admin.from("photos").select("*").in("finding_id", findingIds)
        : { data: [] as any[] };

    const photosWithUrls = await Promise.all(
      (photosRaw || []).map(async (photo: any) => {
        const filePath =
          photo.file_path ||
          photo.storage_path ||
          photo.photo_path ||
          getStoragePathFromUrl(photo.public_url) ||
          getStoragePathFromUrl(photo.image_url) ||
          getStoragePathFromUrl(photo.photo_url);

        if (!filePath) {
          return {
            ...photo,
            signed_url:
              photo.signed_url ||
              photo.public_url ||
              photo.image_url ||
              photo.photo_url ||
              "",
          };
        }

        const { data } = await admin.storage
          .from("inspection-photos")
          .createSignedUrl(filePath, 60 * 60 * 24 * 7);

        return {
          ...photo,
          signed_url:
            data?.signedUrl ||
            photo.signed_url ||
            photo.public_url ||
            photo.image_url ||
            photo.photo_url ||
            "",
        };
      })
    );

    const photosByFindingId = photosWithUrls.reduce(
      (acc: Record<string, any[]>, photo: any) => {
        if (!photo.finding_id) return acc;
        if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
        acc[photo.finding_id].push(photo);
        return acc;
      },
      {}
    );

    const hydratedFindings = filteredFindings.map((finding: any) => ({
      ...finding,
      photos: photosByFindingId[finding.id] || [],
    }));

    let contacts: any[] = [];

    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const isInspector = Boolean(user?.id && inspection?.inspector_id === user.id);

      if (isInspector) {
        const { data: contactsRaw } = await admin
          .from("inspection_contacts")
          .select("name, email, role, portal_access")
          .eq("inspection_id", inspectionId);

        contacts = (contactsRaw || []).filter((contact: any) => {
          if (!contact?.email) return false;
          if (contact.portal_access === false) return false;
          return true;
        });
      }
    } catch (error) {
      console.error("Public repair request contact load skipped:", error);
    }

    return NextResponse.json({
      success: true,
      inspection: safeInspectionForPublic(inspection),
      findings: hydratedFindings,
      contacts,
    });
  } catch (error: any) {
    console.error("Public repair request error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load repair request." },
      { status: 500 }
    );
  }
}
