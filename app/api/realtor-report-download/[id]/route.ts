import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

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
  "Garage",
  "Disclaimers",
];

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

function cleanText(value: any) {
  return String(value || "").trim();
}

function cleanEmail(value: any) {
  return cleanText(value).toLowerCase();
}

function escapeHtml(value: any) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSection(section: any) {
  const clean = cleanText(section) || "Inspection Details";

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

function getSectionNumber(section: any) {
  const clean = normalizeSection(section);
  const index = SECTION_ORDER.findIndex((item) => item === clean);
  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
}

function getFindingTitle(finding: any) {
  return (
    finding?.title ||
    finding?.finding_title ||
    finding?.defect_title ||
    finding?.name ||
    "Untitled Finding"
  );
}

function isReportDefect(finding: any) {
  const section = cleanText(finding?.section).toLowerCase();
  const title = cleanText(getFindingTitle(finding)).toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;
  if (
    [
      "in attendance",
      "occupancy",
      "style",
      "temperature",
      "type of building",
      "weather conditions",
    ].includes(title)
  ) {
    return false;
  }

  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function getFindingText(finding: any) {
  return (
    finding?.recommendation ||
    finding?.observation ||
    finding?.implication ||
    finding?.comment ||
    finding?.description ||
    "Documented inspection item."
  );
}

function getSeverityBucket(severityValue: any) {
  const severity = cleanText(severityValue || "Recommended Repair").toLowerCase();

  if (severity.includes("safety") || severity.includes("hazard") || severity.includes("major")) {
    return "Safety / Major";
  }

  if (severity.includes("maintenance") || severity.includes("monitor") || severity.includes("minor")) {
    return "Maintenance / Monitor";
  }

  if (severity.includes("information") || severity.includes("info") || severity.includes("client")) {
    return "Informational";
  }

  return "Recommended Repair";
}

function getPropertyAddress(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection property"
  );
}

function getPropertyPhoto(inspection: any) {
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
  return (
    inspection?.property_photo_path ||
    inspection?.property_photo_storage_path ||
    inspection?.cover_photo_path ||
    inspection?.property_image_path ||
    inspection?.storage_path ||
    getStoragePathFromUrl(getPropertyPhoto(inspection)) ||
    ""
  );
}

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value) || "N/A";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
    if (index !== -1) return decodeURIComponent(cleanUrl.substring(index + marker.length));
  }

  return "";
}

function getPhotoStoragePath(photo: any, preferThumbnail = true) {
  const thumbnailPath =
    photo?.thumbnail_path ||
    getStoragePathFromUrl(photo?.thumbnail_url) ||
    getStoragePathFromUrl(photo?.signed_thumbnail_url);

  const fullPath =
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    photo?.image_path ||
    getStoragePathFromUrl(photo?.signed_url) ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url) ||
    getStoragePathFromUrl(photo?.url) ||
    "";

  return preferThumbnail ? thumbnailPath || fullPath : fullPath || thumbnailPath || "";
}

function getPhotoFallbackUrl(photo: any, preferThumbnail = true) {
  const thumbnailUrl =
    photo?.signed_thumbnail_url ||
    photo?.thumbnail_url ||
    "";

  const fullUrl =
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    photo?.url ||
    "";

  return preferThumbnail ? thumbnailUrl || fullUrl : fullUrl || thumbnailUrl || "";
}

function getLegacyFindingPhotoCandidates(finding: any) {
  return [
    finding?.signed_thumbnail_url,
    finding?.thumbnail_url,
    finding?.signed_image_url,
    finding?.public_image_url,
    finding?.image_url,
    finding?.photo_url,
    finding?.url,
  ].filter(Boolean);
}

function roleLooksLikeRealtor(roleValue: any) {
  const role = cleanText(roleValue).toLowerCase();
  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("buyer") ||
    role.includes("transaction") ||
    role.includes("coordinator")
  );
}

function inspectionHasRealtorEmail(inspection: any, userEmail: string) {
  const fields = [
    inspection?.realtor_email,
    inspection?.agent_email,
    inspection?.buyer_agent_email,
    inspection?.buyers_agent_email,
    inspection?.transaction_coordinator_email,
  ];

  return fields.some((field) => cleanEmail(field) === userEmail);
}

async function signedUrlMap(admin: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const result: Record<string, string> = {};

  if (!uniquePaths.length) return result;

  const chunkSize = 80;

  for (let index = 0; index < uniquePaths.length; index += chunkSize) {
    const chunk = uniquePaths.slice(index, index + chunkSize);
    const { data, error } = await admin.storage
      .from("inspection-photos")
      .createSignedUrls(chunk, 60 * 60 * 24 * 7);

    if (error) {
      console.error("Realtor report download signed URL error:", error);
      continue;
    }

    (data || []).forEach((item: any, itemIndex: number) => {
      const path = item?.path || chunk[itemIndex];
      if (path && item?.signedUrl) result[path] = item.signedUrl;
    });
  }

  return result;
}

function dedupeDownloadPhotos(photos: any[]) {
  const seen = new Set<string>();
  const cleanPhotos: any[] = [];

  for (const photo of photos || []) {
    const url = cleanText(photo?.download_url || photo?.signed_url || photo?.public_url || photo?.image_url || photo?.photo_url || photo?.url || "");
    const path = cleanText(photo?.thumbnail_path || photo?.file_path || photo?.storage_path || photo?.photo_path || photo?.image_path || "");
    const key = path || url.split("?")[0];

    if (!key || seen.has(key)) continue;

    seen.add(key);
    cleanPhotos.push(photo);
  }

  return cleanPhotos;
}

async function loadPhotos(admin: any, inspectionId: string, findingIds: string[]) {
  const byId = new Map<string, any>();

  if (findingIds.length) {
    const { data, error } = await admin
      .from("photos")
      .select("*")
      .in("finding_id", findingIds)
      .order("created_at", { ascending: true });

    if (!error) {
      (data || []).forEach((photo: any) => {
        if (photo?.id) byId.set(String(photo.id), photo);
      });
    } else {
      console.error("Agent report photos by finding_id failed:", error);
    }
  }

  // Some older uploads are attached to the inspection first, then finding_id is filled later.
  // If this column exists, this catches those too. If it does not exist, we silently ignore it.
  const { data: inspectionPhotos, error: inspectionPhotoError } = await admin
    .from("photos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  if (!inspectionPhotoError) {
    (inspectionPhotos || []).forEach((photo: any) => {
      if (photo?.id) byId.set(String(photo.id), photo);
    });
  }

  return Array.from(byId.values());
}

function buildAgentReportHtml({
  inspection,
  findings,
  reportMode,
  propertyPhotoUrl,
}: {
  inspection: any;
  findings: any[];
  reportMode: "agent" | "full";
  propertyPhotoUrl?: string;
}) {
  const property = getPropertyAddress(inspection);
  const defects = reportMode === "full" ? findings.filter(isReportDefect) : findings.filter(isReportDefect);
  const isFull = reportMode === "full";

  const counts = defects.reduce(
    (acc: Record<string, number>, finding: any) => {
      const bucket = getSeverityBucket(finding.severity);
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    },
    {}
  );

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    findings: defects.filter((finding) => normalizeSection(finding.section) === section),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = defects.filter((finding) => !SECTION_ORDER.includes(normalizeSection(finding.section)));
  if (otherFindings.length) grouped.push({ section: "Other", findings: otherFindings });

  const sectionsHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section);
    const itemsHtml = group.findings.map((finding: any, index: number) => {
      const photos = Array.isArray(finding.photos)
        ? finding.photos.slice(0, isFull ? 8 : 2)
        : [];
      const photoHtml = photos.length
        ? `<div class="photos">${photos.map((photo: any) => `<img src="${escapeHtml(photo.download_url)}" alt="Finding photo" />`).join("")}</div>`
        : "";

      const observationHtml = isFull && finding.observation
        ? `<p class="finding-sub"><strong>Observation:</strong> ${escapeHtml(finding.observation)}</p>`
        : "";
      const implicationHtml = isFull && finding.implication
        ? `<p class="finding-sub"><strong>Implication:</strong> ${escapeHtml(finding.implication)}</p>`
        : "";
      const recommendationHtml = isFull && finding.recommendation
        ? `<p class="finding-sub"><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p>`
        : `<p class="finding-text">${escapeHtml(getFindingText(finding))}</p>`;

      return `
        <article class="finding">
          <div class="finding-head">
            <div>
              <p class="item-number">Item #${sectionNumber}.1.${index + 1}</p>
              <h3>${escapeHtml(getFindingTitle(finding))}</h3>
              <p class="section-line">${escapeHtml(group.section)} · ${escapeHtml(getSeverityBucket(finding.severity))}</p>
            </div>
            <span class="severity">${escapeHtml(getSeverityBucket(finding.severity))}</span>
          </div>
          ${photoHtml}
          ${observationHtml}
          ${implicationHtml}
          ${recommendationHtml}
        </article>
      `;
    }).join("");

    return `<section class="report-section"><h2>${escapeHtml(group.section)}</h2>${itemsHtml}</section>`;
  }).join("");

  const coverPhotoHtml = propertyPhotoUrl
    ? `<div class="cover-photo"><img src="${escapeHtml(propertyPhotoUrl)}" alt="Property photo" /></div>`
    : `<div class="cover-photo empty"><span>No property photo available</span></div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isFull ? "Full Report" : "Agent Report"} - ${escapeHtml(property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: .45in; }
    body { margin: 0; background: #020617; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; }
    .screen-actions { max-width: 980px; margin: 18px auto 12px; padding: 0 12px; display: flex; gap: 10px; flex-wrap: wrap; }
    .screen-actions button { min-height: 44px; border: 1px solid #14b8a6; border-radius: 12px; background: #020617; color: #5eead4; padding: 10px 16px; font-weight: 900; cursor: pointer; }
    .shell { max-width: 980px; margin: 0 auto 28px; padding: 12px; }
    .paper { background: #fff; border: 1px solid #cbd5e1; border-radius: 14px; padding: 24px; box-shadow: 0 14px 40px rgba(0,0,0,.18); }
    .brand { display: flex; justify-content: space-between; gap: 18px; border-bottom: 3px solid #0f8f8f; padding-bottom: 16px; margin-bottom: 16px; }
    .eyebrow { margin: 0 0 6px; color: #0f8f8f; font-size: 11px; font-weight: 900; letter-spacing: .24em; text-transform: uppercase; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.08; font-weight: 900; color: #020617; }
    .property { margin: 0; color: #475569; font-weight: 800; }
    .badge { height: fit-content; border: 1px solid #0f8f8f; border-radius: 999px; color: #0f8f8f; padding: 8px 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .cover-photo { height: 245px; margin: 16px 0 18px; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 13px; background: #f8fafc; display: flex; align-items: center; justify-content: center; }
    .cover-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-photo.empty span { color: #64748b; font-weight: 900; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .summary div { border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 10px 12px; }
    .summary span { display: block; margin-bottom: 3px; color: #64748b; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .summary strong { display: block; color: #020617; font-size: 13px; font-weight: 900; word-break: break-word; }
    .report-section { margin-top: 26px; }
    .report-section h2 { margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid #cbd5e1; color: #020617; font-size: 18px; font-weight: 900; }
    .finding { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-top: 14px; }
    .finding-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .item-number { display: inline-block; margin: 0 0 8px; border: 1px solid #0f8f8f; border-radius: 999px; background: #ecfeff; color: #0f766e; padding: 4px 9px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    h3 { margin: 0; font-size: 15px; color: #020617; line-height: 1.25; }
    .section-line { margin: 5px 0 0; color: #64748b; font-size: 11px; font-weight: 800; }
    .severity { flex-shrink: 0; border: 1px solid #0f8f8f; border-radius: 999px; background: #ecfeff; color: #0f766e; padding: 5px 9px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
    .finding-text, .finding-sub { margin: 10px 0 0; color: #334155; white-space: pre-line; }
    .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .photos img { width: 100%; max-height: ${isFull ? "320px" : "210px"}; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
    .note { margin-top: 16px; color: #64748b; font-size: 11px; }
    @media (max-width: 760px) { .summary, .photos { grid-template-columns: 1fr; } .brand { flex-direction: column; } }
    @media print { body { background: #fff; } .screen-actions { display: none; } .shell { max-width: none; margin: 0; padding: 0; } .paper { border: 0; box-shadow: none; border-radius: 0; padding: 0; } }
  </style>
</head>
<body>
  <div class="screen-actions"><button onclick="window.print()">Print / Save PDF</button></div>
  <main class="shell">
    <section class="paper">
      <div class="brand">
        <div>
          <p class="eyebrow">On Point Home Inspections</p>
          <h1>${isFull ? "Full Report Download" : "Agent Report Download"}</h1>
          <p class="property">${escapeHtml(property)}</p>
        </div>
        <div class="badge">${isFull ? "Full Report" : "Agent Report"}</div>
      </div>
      ${coverPhotoHtml}
      <div class="summary">
        <div><span>Inspection Date</span><strong>${escapeHtml(formatDate(inspection.inspection_date || inspection.scheduled_date || inspection.created_at))}</strong></div>
        <div><span>Client</span><strong>${escapeHtml(inspection.client_name || inspection.client || "N/A")}</strong></div>
        <div><span>Defects</span><strong>${defects.length}</strong></div>
        <div><span>Report Type</span><strong>${isFull ? "Full" : "Agent Friendly"}</strong></div>
        <div><span>Safety / Major</span><strong>${counts["Safety / Major"] || 0}</strong></div>
        <div><span>Recommended Repair</span><strong>${counts["Recommended Repair"] || 0}</strong></div>
        <div><span>Maintenance / Monitor</span><strong>${counts["Maintenance / Monitor"] || 0}</strong></div>
        <div><span>Informational</span><strong>${counts["Informational"] || 0}</strong></div>
      </div>
      <p class="note">${isFull ? "This report includes documented findings with available photos." : "This lightweight report is designed for realtor review and smaller downloads. It focuses on documented findings and uses small linked photos instead of embedding large image files."}</p>
      ${sectionsHtml || `<p>No report findings were found.</p>`}
    </section>
  </main>
</body>
</html>`;
}

function getDownloadName(property: string, reportMode: "agent" | "full") {
  const slug = cleanText(property)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return `${slug || "inspection-report"}-${reportMode === "full" ? "full-report" : "agent-report"}.html`;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const inspectionId = cleanText(id);
    const url = new URL(req.url);
    const reportMode = url.searchParams.get("type") === "full" ? "full" : "agent";

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const userEmail = cleanEmail(user.email);
    const admin = createAdminClient();

    const { data: inspection, error: inspectionError } = await admin
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    let allowed = inspectionHasRealtorEmail(inspection, userEmail);

    if (!allowed) {
      const { data: contact } = await admin
        .from("inspection_contacts")
        .select("id, role, email, portal_access")
        .eq("inspection_id", inspectionId)
        .ilike("email", userEmail)
        .maybeSingle();

      allowed = Boolean(contact && contact.portal_access !== false && roleLooksLikeRealtor(contact.role));
    }

    if (!allowed) {
      return NextResponse.json({ error: "You do not have access to this report." }, { status: 403 });
    }

    const { data: findingsRaw } = await admin
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const normalizedFindings = (findingsRaw || []).map((finding: any) => ({
      ...finding,
      section: normalizeSection(finding.section),
    }));

    const findingIds = normalizedFindings.map((finding: any) => cleanText(finding.id)).filter(Boolean);
    const preferThumbnail = reportMode !== "full";
    const photosRaw = await loadPhotos(admin, inspectionId, findingIds);

    const photoPaths = photosRaw.map((photo: any) => getPhotoStoragePath(photo, preferThumbnail)).filter(Boolean);

    const legacyFindingPhotoPaths = normalizedFindings
      .flatMap((finding: any) => getLegacyFindingPhotoCandidates(finding).map((candidate: any) => getStoragePathFromUrl(candidate)))
      .filter(Boolean);

    const propertyPhotoPath = getPropertyPhotoPath(inspection);
    const allPaths = [...photoPaths, ...legacyFindingPhotoPaths, propertyPhotoPath].filter(Boolean);
    const signedMap = await signedUrlMap(admin, allPaths);

    const photosWithUrls = photosRaw.map((photo: any) => {
      const path = getPhotoStoragePath(photo, preferThumbnail);
      return {
        ...photo,
        download_url: (path && signedMap[path]) || getPhotoFallbackUrl(photo, preferThumbnail) || "",
      };
    });

    const photosByFindingId = photosWithUrls.reduce((acc: Record<string, any[]>, photo: any) => {
      const findingId = cleanText(photo.finding_id || photo.findingId);
      if (!findingId || !photo.download_url) return acc;
      if (!acc[findingId]) acc[findingId] = [];
      acc[findingId].push(photo);
      return acc;
    }, {});

    const findings = normalizedFindings.map((finding: any) => {
      const findingId = cleanText(finding.id);
      const directPhotos = photosByFindingId[findingId] || [];
      const legacyPhotos = getLegacyFindingPhotoCandidates(finding)
        .map((candidate: any) => {
          const path = getStoragePathFromUrl(candidate);
          const urlValue = (path && signedMap[path]) || candidate || "";
          return urlValue ? { download_url: urlValue } : null;
        })
        .filter(Boolean);

      const finalPhotos = directPhotos.length > 0 ? directPhotos : legacyPhotos;

      return {
        ...finding,
        photos: dedupeDownloadPhotos(finalPhotos.filter((photo: any) => photo?.download_url)),
      };
    });

    const rawPropertyPhoto = getPropertyPhoto(inspection);
    const propertyPhotoUrl =
      (propertyPhotoPath && signedMap[propertyPhotoPath]) ||
      rawPropertyPhoto ||
      "";

    const html = buildAgentReportHtml({ inspection, findings, reportMode, propertyPhotoUrl });
    const property = getPropertyAddress(inspection);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getDownloadName(property, reportMode)}"`,
        "Cache-Control": "private, max-age=20, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not download realtor report." },
      { status: 500 }
    );
  }
}
