import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Disclaimers",
  "Garage",
];

const REPAIR_IMAGE_TRANSFORM_OPTIONS = {
  transform: {
    width: 1200,
    resize: "contain",
  },
};

const THUMBNAIL_IMAGE_TRANSFORM_OPTIONS = {
  transform: {
    width: 420,
    resize: "contain",
  },
};

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

function normalizeSection(section: string | null | undefined) {
  if (!section) return "Inspection Details";

  const clean = section.trim();

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getSectionNumber(sectionValue: any) {
  const section = normalizeSection(String(sectionValue || ""));
  const index = SECTION_ORDER.findIndex(
    (item) => item.toLowerCase() === section.toLowerCase()
  );

  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const cleanUrl = String(url).split("?")[0].split("#")[0];
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

  return "";
}

function getPhotoStoragePath(photo: any) {
  return (
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url) ||
    ""
  );
}

function getPhotoFallbackUrl(photo: any) {
  return (
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    ""
  );
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

  if (excluded.includes(title)) return false;
  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function addItemNumbers(findings: any[]) {
  const counters: Record<string, number> = {};

  return (findings || []).map((finding: any) => {
    const section = normalizeSection(finding.section);
    const sectionNumber = getSectionNumber(section);
    const key = String(sectionNumber);

    counters[key] = (counters[key] || 0) + 1;

    const existing =
      finding.item_number ||
      finding.finding_number ||
      finding.report_item_number ||
      finding.reference_number ||
      "";

    const itemNumber = existing || `${sectionNumber}.1.${counters[key]}`;

    return {
      ...finding,
      section,
      item_number: itemNumber,
      finding_number: itemNumber,
      report_item_number: itemNumber,
      reference_number: itemNumber,
    };
  });
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

function parseSelectedIds(value: string | null) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createSignedUrlMap({
  admin,
  paths,
  transformOptions,
}: {
  admin: any;
  paths: string[];
  transformOptions?: any;
}) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const chunkSize = 80;

  for (let index = 0; index < uniquePaths.length; index += chunkSize) {
    const chunk = uniquePaths.slice(index, index + chunkSize);

    const { data, error } = await admin.storage
      .from("inspection-photos")
      .createSignedUrls(chunk, 60 * 60 * 24 * 7, transformOptions);

    if (error) {
      console.error("Repair request batch photo signing failed:", error);
      continue;
    }

    (data || []).forEach((item: any, itemIndex: number) => {
      const path = item?.path || chunk[itemIndex];

      if (path && item?.signedUrl) {
        signedMap[path] = item.signedUrl;
      }
    });
  }

  return signedMap;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = url.searchParams.get("inspection_id");
    const selectedIdsFromUrl = parseSelectedIds(url.searchParams.get("selected"));
    const selectedIdSet = new Set(selectedIdsFromUrl.map(String));

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

    if (inspectionError) {
      console.error("Public repair request inspection load failed:", inspectionError);
      return NextResponse.json(
        { error: "Could not load inspection." },
        { status: 500 }
      );
    }

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    let findingsQuery = admin
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    if (selectedIdsFromUrl.length > 0) {
      findingsQuery = findingsQuery.in("id", selectedIdsFromUrl);
    }

    const { data: findingsRaw, error: findingsError } = await findingsQuery;

    if (findingsError) {
      console.error("Public repair request findings load failed:", findingsError);
      return NextResponse.json(
        { error: "Could not load repair request findings." },
        { status: 500 }
      );
    }

    const orderedFindingsRaw =
      selectedIdsFromUrl.length > 0
        ? selectedIdsFromUrl
            .map((id) => (findingsRaw || []).find((finding: any) => String(finding.id) === String(id)))
            .filter(Boolean)
        : findingsRaw || [];

    const numberedFindings = addItemNumbers(orderedFindingsRaw);
    const filteredFindings = numberedFindings.filter(isRepairFinding);
    const findingIds = filteredFindings.map((finding: any) => finding.id).filter(Boolean);

    const { data: photosRaw, error: photosError } =
      findingIds.length > 0
        ? await admin
            .from("photos")
            .select("*")
            .in("finding_id", findingIds)
            .order("created_at", { ascending: true })
        : { data: [] as any[], error: null };

    if (photosError) {
      console.error("Public repair request photos load failed:", photosError);
    }

    const photoRows = photosRaw || [];
    const photoPaths = photoRows.map(getPhotoStoragePath).filter(Boolean);
    const thumbnailPaths = photoRows.map((photo: any) => photo.thumbnail_path).filter(Boolean);

    const [signedPhotoMap, signedThumbnailMap] = await Promise.all([
      createSignedUrlMap({
        admin,
        paths: photoPaths,
        transformOptions: REPAIR_IMAGE_TRANSFORM_OPTIONS,
      }),
      createSignedUrlMap({
        admin,
        paths: thumbnailPaths,
        transformOptions: THUMBNAIL_IMAGE_TRANSFORM_OPTIONS,
      }),
    ]);

    const photosWithUrls = photoRows.map((photo: any) => {
      const filePath = getPhotoStoragePath(photo);

      return {
        ...photo,
        signed_url: (filePath && signedPhotoMap[filePath]) || getPhotoFallbackUrl(photo) || "",
        signed_thumbnail_url:
          (photo.thumbnail_path && signedThumbnailMap[photo.thumbnail_path]) ||
          photo.thumbnail_url ||
          "",
      };
    });

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

    const response = NextResponse.json({
      success: true,
      inspection: safeInspectionForPublic(inspection),
      findings: hydratedFindings,
      contacts,
      selected_ids: selectedIdsFromUrl,
    });

    response.headers.set("Cache-Control", "private, max-age=20, stale-while-revalidate=120");

    return response;
  } catch (error: any) {
    console.error("Public repair request error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load repair request." },
      { status: 500 }
    );
  }
}
