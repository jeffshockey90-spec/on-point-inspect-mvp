import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteProps = {
  params: Promise<{ id: string }>;
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function buildAddress(row: any) {
  return (
    cleanText(row?.address) ||
    cleanText(row?.property_address) ||
    cleanText(row?.full_address) ||
    cleanText(row?.propertyAddress) ||
    [row?.street, row?.city, row?.state, row?.zip]
      .map(cleanText)
      .filter(Boolean)
      .join(", ")
  );
}

function createSupabaseStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createServiceClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const cleanUrl = String(url || "").split("?")[0];
  const markers = [
    "/inspection-photos/",
    "/object/public/inspection-photos/",
    "/object/sign/inspection-photos/",
    "/object/authenticated/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = cleanUrl.indexOf(marker);

    if (index !== -1) {
      return decodeURIComponent(cleanUrl.substring(index + marker.length));
    }
  }

  if (cleanUrl.startsWith("property-photos/") || cleanUrl.startsWith("properties/")) {
    return decodeURIComponent(cleanUrl);
  }

  return "";
}

function getRawPropertyPhoto(inspection: any) {
  return (
    inspection?.property_image ||
    inspection?.street_view_url ||
    inspection?.cover_photo_url ||
    inspection?.google_photo_url ||
    inspection?.property_photo_url ||
    inspection?.place_photo_url ||
    inspection?.photo_url ||
    inspection?.image_url ||
    ""
  );
}

function getPropertyPhotoPath(inspection: any) {
  const rawPropertyPhoto = getRawPropertyPhoto(inspection);

  return (
    inspection?.property_photo_path ||
    inspection?.property_image_path ||
    inspection?.cover_photo_path ||
    inspection?.street_view_path ||
    inspection?.storage_path ||
    getStoragePathFromUrl(rawPropertyPhoto) ||
    ""
  );
}

async function getSignedPropertyPhotoUrl(storageSupabase: any, inspection: any) {
  const rawPropertyPhoto = getRawPropertyPhoto(inspection);
  const propertyPhotoPath = getPropertyPhotoPath(inspection);

  if (!propertyPhotoPath) return cleanText(rawPropertyPhoto);

  const { data, error } = await storageSupabase.storage
    .from("inspection-photos")
    .createSignedUrl(propertyPhotoPath, 60 * 60 * 24 * 7);

  if (error || !data?.signedUrl) {
    console.error("Marketing property photo signed URL error:", error);
    return cleanText(rawPropertyPhoto);
  }

  return data.signedUrl;
}

async function maybeSingle(query: any) {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function getInspectionRecord(supabase: any, id: string, userId: string) {
  const inspection =
    (await maybeSingle(
      supabase
        .from("inspections")
        .select("*")
        .eq("id", id)
        .eq("inspector_id", userId)
    )) ||
    null;

  if (inspection) return inspection;

  const report =
    (await maybeSingle(supabase.from("reports").select("*").eq("id", id))) ||
    (await maybeSingle(supabase.from("reports").select("*").eq("inspection_id", id)));

  if (!report) return null;

  const inspectionId = cleanText(report?.inspection_id || report?.id);
  if (!inspectionId) return report;

  return (
    (await maybeSingle(
      supabase
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .eq("inspector_id", userId)
    )) || report
  );
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const inspection = await getInspectionRecord(supabase, id, user.id);

  if (!inspection) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // This is the key fix:
  // use the same service-role storage client pattern as the report page.
  const storageSupabase = createSupabaseStorageClient() || supabase;
  const propertyPhotoUrl = await getSignedPropertyPhotoUrl(storageSupabase, inspection);

  return NextResponse.json({
    id: String(inspection.id || id),
    address: buildAddress(inspection),
    photos: propertyPhotoUrl
      ? [
          {
            id: "property-photo",
            url: propertyPhotoUrl,
            label: "Primary Property Photo",
          },
        ]
      : [],
  });
}
