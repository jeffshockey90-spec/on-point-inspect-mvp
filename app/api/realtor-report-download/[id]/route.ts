import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

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

function getInspectionShareToken(inspection: any) {
  return cleanText(
    inspection?.public_share_token ||
      inspection?.share_token ||
      inspection?.report_share_token
  );
}

function onlineReportUrlForInspection(inspection: any) {
  const appUrl = cleanText(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL);
  const token = getInspectionShareToken(inspection);
  if (!appUrl || !token) return "";
  return `${appUrl.replace(/\/$/, "")}/public-report/${encodeURIComponent(token)}`;
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

function inspectionBelongsToUser(inspection: any, user: any) {
  const userId = cleanText(user?.id);
  const userEmail = cleanEmail(user?.email);

  const ownerIds = [
    inspection?.inspector_id,
    inspection?.inspector_user_id,
    inspection?.user_id,
    inspection?.owner_id,
    inspection?.created_by,
    inspection?.auth_user_id,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  if (userId && ownerIds.includes(userId)) return true;

  const ownerEmails = [
    inspection?.inspector_email,
    inspection?.owner_email,
    inspection?.created_by_email,
    inspection?.company_email,
  ]
    .map((value) => cleanEmail(value))
    .filter(Boolean);

  return Boolean(userEmail && ownerEmails.includes(userEmail));
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

function pickFirstUrl(...values: any[]) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean && clean !== "null" && clean !== "undefined") return clean;
  }

  return "";
}

function pickFirstText(...values: any[]) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean && clean !== "null" && clean !== "undefined") return clean;
  }

  return "";
}

async function maybeSingleOrNull(query: any) {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function findCompanyById(admin: any, companyId: any) {
  const id = cleanText(companyId);
  if (!id) return null;

  return maybeSingleOrNull(admin.from("companies").select("*").eq("id", id));
}

async function loadCompanyBranding(admin: any, inspection: any, fallbackEmail = "") {
  let company: any = null;
  let inspector: any = null;

  const companyId =
    inspection?.company_id ||
    inspection?.companyId ||
    inspection?.company ||
    inspection?.company_uuid ||
    "";

  company = await findCompanyById(admin, companyId);

  const inspectorIds = [
    inspection?.inspector_id,
    inspection?.inspector_user_id,
    inspection?.user_id,
    inspection?.owner_id,
    inspection?.created_by,
    inspection?.auth_user_id,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  for (const inspectorId of inspectorIds) {
    if (!inspector) {
      inspector =
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("user_id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("owner_id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("auth_user_id", inspectorId)));
    }

    if (!company) {
      const companyUser = await maybeSingleOrNull(
        admin.from("company_users").select("company_id, role").eq("user_id", inspectorId)
      );

      company = await findCompanyById(admin, companyUser?.company_id);
    }

    if (company) break;
  }

  const inspectorEmail = cleanEmail(
    inspection?.inspector_email ||
      inspection?.owner_email ||
      inspection?.created_by_email ||
      fallbackEmail
  );

  if (!inspector && inspectorEmail) {
    inspector =
      (await maybeSingleOrNull(admin.from("inspectors").select("*").ilike("email", inspectorEmail))) ||
      (await maybeSingleOrNull(admin.from("inspectors").select("*").ilike("owner_email", inspectorEmail)));
  }

  if (!company && inspector?.company_id) {
    company = await findCompanyById(admin, inspector.company_id);
  }

  if (!company && inspectorEmail) {
    company =
      (await maybeSingleOrNull(admin.from("companies").select("*").ilike("email", inspectorEmail))) ||
      (await maybeSingleOrNull(admin.from("companies").select("*").ilike("owner_email", inspectorEmail)));
  }

  const companyName = pickFirstText(
    company?.display_name,
    company?.name,
    inspection?.company_name,
    inspection?.inspection_company,
    "On Point Home Inspections LLC"
  );

  const companyEmail = pickFirstText(
    company?.email,
    inspection?.company_email,
    inspection?.inspector_email,
    fallbackEmail
  );

  const companyPhone = pickFirstText(company?.phone, inspection?.company_phone, inspection?.inspector_phone);
  const companyWebsite = pickFirstText(company?.website, inspection?.company_website);

  const logoUrl = pickFirstUrl(
    company?.logo_url,
    company?.company_logo_url,
    company?.profile_logo_url,
    company?.public_logo_url,
    company?.brand_logo_url,
    company?.logo,
    company?.image_url,
    company?.avatar_url,
    inspector?.company_logo_url,
    inspector?.logo_url,
    inspector?.profile_logo_url,
    inspector?.brand_logo_url,
    inspector?.logo,
    inspector?.image_url,
    inspection?.company_logo_url,
    inspection?.logo_url
  );

  const brandColor = pickFirstText(company?.brand_color, inspection?.brand_color, "#0f8f8f");
  const licenseInfo = pickFirstText(company?.license_info, inspector?.license_info, inspection?.license_info);
  const footerBranding = pickFirstText(
    company?.report_footer_branding,
    "Protecting Your Investment. One Inspection at a Time."
  );

  return {
    company,
    inspector,
    companyName,
    companyEmail,
    companyPhone,
    companyWebsite,
    logoUrl,
    brandColor,
    licenseInfo,
    footerBranding,
  };
}

function buildLogoHtml(branding: any, variant: "cover" | "header" = "header") {
  const logoUrl = cleanText(branding?.logoUrl);

  if (logoUrl) {
    return `<img class="${variant === "cover" ? "cover-logo-img" : "header-logo-img"}" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(branding?.companyName || "Company Logo")}" />`;
  }

  return `<div class="${variant === "cover" ? "cover-logo-fallback" : "header-logo-fallback"}">${escapeHtml(branding?.companyName || "Company")}</div>`;
}

function getSectionAnchor(section: any) {
  return cleanText(section)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function severityKey(value: any) {
  return getSeverityBucket(value).toLowerCase().replace(/[^a-z]+/g, "-");
}

function buildAgentReportHtml({
  inspection,
  findings,
  reportMode,
  propertyPhotoUrl,
  branding,
  qrCodeDataUrl,
}: {
  inspection: any;
  findings: any[];
  reportMode: "agent" | "full";
  propertyPhotoUrl?: string;
  branding: any;
  qrCodeDataUrl?: string;
}) {
  const property = getPropertyAddress(inspection);
  const isFull = reportMode === "full";
  const defects = findings.filter(isReportDefect);

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

  const otherFindings = defects.filter(
    (finding) => !SECTION_ORDER.includes(normalizeSection(finding.section))
  );

  if (otherFindings.length) grouped.push({ section: "Other", findings: otherFindings });

  const clientName = inspection.client_name || inspection.client || "N/A";
  const realtorName = inspection.realtor_name || inspection.agent_name || inspection.buyer_agent_name || "N/A";
  const inspectorName = inspection.inspector_name || inspection.inspector || "Jeff Shockey";
  const inspectionDate = formatDate(inspection.inspection_date || inspection.scheduled_date || inspection.created_at);
  const cityStateZip = [inspection.city, inspection.state, inspection.zip].filter(Boolean).join(", ");
  const reportId = inspection.report_number || inspection.id || "";
  const onlineReportUrl = onlineReportUrlForInspection(inspection);
  const companyName = branding?.companyName || "On Point Home Inspections LLC";
  const companyEmail = branding?.companyEmail || "";
  const companyPhone = branding?.companyPhone || "";
  const companyWebsite = branding?.companyWebsite || "";
  const licenseInfo = branding?.licenseInfo || "";
  const footerBranding = branding?.footerBranding || "Protecting Your Investment. One Inspection at a Time.";
  const coverLogoHtml = buildLogoHtml(branding, "cover");
  const headerLogoHtml = buildLogoHtml(branding, "header");
  const qrLogoUrl = cleanText(branding?.logoUrl);
  const qrHtml = qrCodeDataUrl
    ? `
      <div class="qr-box real">
        <img class="qr-image" src="${escapeHtml(qrCodeDataUrl)}" alt="Scan to view full inspection report" />
        ${
          qrLogoUrl
            ? `
              <div class="qr-logo">
                <img src="${escapeHtml(qrLogoUrl)}" alt="${escapeHtml(companyName)} logo" />
              </div>
            `
            : ""
        }
      </div>
    `
    : `<div class="qr-box">QR Code<br/>Unavailable</div>`;

  const coverPhotoHtml = propertyPhotoUrl
    ? `<img class="cover-photo" src="${escapeHtml(propertyPhotoUrl)}" alt="Property photo" />`
    : `<div class="cover-photo no-photo">Property photo not available</div>`;

  const tocHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section);
    return `
      <div class="toc-row">
        <span class="toc-num">${escapeHtml(String(sectionNumber))}</span>
        <span class="toc-name">${escapeHtml(group.section)}</span>
        <span class="toc-dots"></span>
        <span class="toc-count">${group.findings.length} item${group.findings.length === 1 ? "" : "s"}</span>
      </div>
    `;
  }).join("");

  const keyFindingsHtml = defects.map((finding: any, index: number) => {
    const section = normalizeSection(finding.section);
    const sectionNumber = getSectionNumber(section);
    const bucket = getSeverityBucket(finding.severity);
    return `
      <li>
        <span class="key-dot ${severityKey(finding.severity)}"></span>
        <span><strong>${escapeHtml(`${sectionNumber}.${index + 1}`)}</strong> ${escapeHtml(section)} — ${escapeHtml(getFindingTitle(finding))}</span>
        <em>${escapeHtml(bucket)}</em>
      </li>
    `;
  }).join("");

  const summaryCards = `
    <div class="summary-cards">
      <div class="summary-card safety-major">
        <div class="summary-icon">!</div>
        <strong>${counts["Safety / Major"] || 0}</strong>
        <span>Safety / Major</span>
      </div>
      <div class="summary-card recommended-repair">
        <div class="summary-icon">✓</div>
        <strong>${counts["Recommended Repair"] || 0}</strong>
        <span>Recommended Repair</span>
      </div>
      <div class="summary-card maintenance-monitor">
        <div class="summary-icon">•</div>
        <strong>${counts["Maintenance / Monitor"] || 0}</strong>
        <span>Maintenance / Monitor</span>
      </div>
      <div class="summary-card informational">
        <div class="summary-icon">i</div>
        <strong>${counts["Informational"] || 0}</strong>
        <span>Informational</span>
      </div>
    </div>
  `;

  const pagesHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section);

    const findingsHtml = group.findings.map((finding: any, index: number) => {
      const sectionItemNumber = `${sectionNumber}.${index + 1}`;
      const photos = Array.isArray(finding.photos)
        ? finding.photos.slice(0, isFull ? 4 : 2)
        : [];

      const photoHtml = photos.length
        ? `<div class="finding-photos">${photos.map((photo: any) => `<img src="${escapeHtml(photo.download_url)}" alt="Finding photo" />`).join("")}</div>`
        : "";

      const observationHtml = finding.observation
        ? `<div class="finding-note"><b>Observation</b><p>${escapeHtml(finding.observation)}</p></div>`
        : "";

      const implicationHtml = finding.implication
        ? `<div class="finding-note"><b>Implication</b><p>${escapeHtml(finding.implication)}</p></div>`
        : "";

      const recommendationHtml = finding.recommendation
        ? `<div class="finding-note recommendation"><b>Recommendation</b><p>${escapeHtml(finding.recommendation)}</p></div>`
        : `<div class="finding-note recommendation"><b>Recommendation</b><p>${escapeHtml(getFindingText(finding))}</p></div>`;

      return `
        <article class="finding-row">
          <div class="finding-main">
            <div class="finding-title-row">
              <span class="finding-num">${escapeHtml(sectionItemNumber)}</span>
              <div>
                <h3>${escapeHtml(getFindingTitle(finding))}</h3>
                <p>${escapeHtml(group.section)} · ${escapeHtml(getSeverityBucket(finding.severity))}</p>
              </div>
              <span class="pill ${severityKey(finding.severity)}">${escapeHtml(getSeverityBucket(finding.severity))}</span>
            </div>

            <div class="finding-body">
              <div class="finding-copy">
                ${observationHtml}
                ${implicationHtml}
                ${recommendationHtml}
              </div>
              ${photoHtml}
            </div>
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="page report-page" id="${escapeHtml(getSectionAnchor(group.section))}">
        <header class="page-header">
          <div class="mini-brand">
            ${headerLogoHtml}
          </div>
          <div class="header-address">
            ${escapeHtml(property)}<br/>
            ${escapeHtml(cityStateZip)}
          </div>
        </header>

        <div class="section-banner">
          <span>${escapeHtml(String(sectionNumber))}</span>
          <div>
            <p>Inspection Section</p>
            <h2>${escapeHtml(group.section)}</h2>
          </div>
        </div>

        <div class="section-info-strip">
          <div><b>Documented Items</b><span>${group.findings.length}</span></div>
          <div><b>Report Type</b><span>${isFull ? "Full Report" : "Agent Summary"}</span></div>
          <div><b>Inspection Date</b><span>${escapeHtml(inspectionDate)}</span></div>
        </div>

        <h4 class="findings-label">Findings</h4>
        ${findingsHtml}

        <footer class="black-footer">
          <span>${escapeHtml(companyName)}</span>
          <span>${escapeHtml(group.section)}</span>
        </footer>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isFull ? "Full Report" : "Agent Report"} - ${escapeHtml(property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { background: #0b1120; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; }
    a { color: #0f8f8f; text-decoration: none; }

    .screen-actions { max-width: 816px; margin: 18px auto 12px; padding: 0 12px; display: flex; gap: 10px; flex-wrap: wrap; }
    .screen-actions button { min-height: 44px; border: 1px solid #14b8a6; border-radius: 12px; background: #020617; color: #5eead4; padding: 10px 16px; font-weight: 900; cursor: pointer; }

    .document { width: 816px; margin: 0 auto 30px; background: #e5e7eb; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .page { position: relative; width: 816px; min-height: 1056px; overflow: hidden; background: #fff; padding: 42px 46px 62px; break-after: page; page-break-after: always; border-bottom: 10px solid #0b1120; }
    .page:last-child { break-after: auto; page-break-after: auto; }

    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 3px solid #0f8f8f; padding-bottom: 14px; margin-bottom: 24px; }
    .mini-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .header-logo-img { width: 155px; max-height: 48px; object-fit: contain; object-position: left center; display: block; }
    .header-logo-fallback { min-height: 42px; max-width: 230px; display: flex; align-items: center; color: #020617; font-size: 18px; font-weight: 900; line-height: 1.05; text-transform: uppercase; }
    .header-address { text-align: right; font-size: 10px; color: #334155; font-weight: 800; line-height: 1.35; }

    .cover-page { text-align: center; }
    .cover-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 28px; }
    .cover-logo-img { width: 210px; max-height: 92px; object-fit: contain; object-position: left center; display: block; }
    .cover-logo-fallback { width: 210px; min-height: 72px; display: flex; align-items: center; color: #020617; font-size: 21px; font-weight: 900; line-height: 1.05; text-align: left; text-transform: uppercase; }
    .company { text-align: right; color: #334155; font-size: 10px; line-height: 1.5; }
    .company strong { color: #020617; font-size: 13px; }
    .cover-photo { width: 610px; height: 330px; object-fit: cover; display: block; margin: 0 auto 28px; border: 1px solid #cbd5e1; border-radius: 4px; }
    .cover-photo.no-photo { background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 900; }
    .cover-eyebrow { color: #0f8f8f; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; margin: 0 0 8px; }
    h1 { margin: 0; color: #020617; font-size: 34px; line-height: 1.08; text-transform: uppercase; }
    .cover-address { margin: 8px 0 0; color: #334155; font-weight: 900; font-size: 15px; }
    .cover-rule { width: 520px; border: 0; border-top: 3px solid #0f8f8f; margin: 28px auto 20px; }
    .cover-details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; }
    .detail-card { border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; padding: 14px; min-height: 88px; }
    .detail-card span { display: block; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; font-weight: 900; }
    .detail-card strong { display: block; margin-top: 8px; color: #020617; font-size: 14px; }

    .toc-title, .summary-title { margin: 10px 0 30px; color: #020617; font-size: 26px; text-transform: uppercase; letter-spacing: .06em; }
    .toc-row { display: grid; grid-template-columns: 34px auto 1fr 90px; align-items: end; gap: 9px; padding: 10px 0; border-bottom: 1px dotted #94a3b8; }
    .toc-num { color: #0f8f8f; font-weight: 900; }
    .toc-name { color: #020617; font-weight: 800; text-transform: uppercase; }
    .toc-count { color: #64748b; text-align: right; font-size: 10px; }

    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0 34px; }
    .summary-card { border-radius: 10px; overflow: hidden; border: 1px solid #cbd5e1; background: #fff; text-align: center; min-height: 148px; }
    .summary-icon { height: 46px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; }
    .summary-card strong { display: block; font-size: 34px; margin-top: 18px; color: #020617; }
    .summary-card span { display: block; color: #64748b; font-size: 9px; font-weight: 900; text-transform: uppercase; padding: 0 8px; }
    .summary-card.safety-major .summary-icon { background: #ef4444; }
    .summary-card.recommended-repair .summary-icon { background: #f97316; }
    .summary-card.maintenance-monitor .summary-icon { background: #0f8f8f; }
    .summary-card.informational .summary-icon { background: #2563eb; }

    .key-findings { margin: 0; padding: 0; list-style: none; }
    .key-findings li { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; border-bottom: 1px solid #e2e8f0; padding: 8px 0; color: #334155; }
    .key-dot { width: 11px; height: 11px; border-radius: 999px; background: #f97316; }
    .key-dot.safety-major { background: #ef4444; }
    .key-dot.maintenance-monitor { background: #0f8f8f; }
    .key-dot.informational { background: #2563eb; }
    .key-findings em { color: #64748b; font-style: normal; font-size: 9px; text-transform: uppercase; font-weight: 900; }

    .section-banner { display: flex; align-items: center; gap: 18px; margin: 8px 0 22px; }
    .section-banner > span { width: 74px; height: 58px; background: #0f8f8f; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; clip-path: polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%); }
    .section-banner p { margin: 0; color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 900; letter-spacing: .12em; }
    .section-banner h2 { margin: 2px 0 0; color: #020617; font-size: 28px; text-transform: uppercase; }
    .section-info-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 12px 0; margin-bottom: 18px; }
    .section-info-strip b { display: block; color: #0f8f8f; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; }
    .section-info-strip span { display: block; color: #334155; font-weight: 800; margin-top: 3px; }
    .findings-label { color: #020617; text-transform: uppercase; letter-spacing: .12em; margin: 14px 0 6px; font-size: 12px; border-bottom: 2px solid #0f8f8f; padding-bottom: 7px; }

    .finding-row { break-inside: avoid; page-break-inside: avoid; padding: 12px 0 16px; border-bottom: 1px solid #e2e8f0; }
    .finding-title-row { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: start; margin-bottom: 10px; }
    .finding-num { background: #0f8f8f; color: #fff; border-radius: 4px; padding: 7px 6px; text-align: center; font-weight: 900; font-size: 11px; }
    h3 { margin: 0; color: #020617; font-size: 15px; line-height: 1.25; }
    .finding-title-row p { margin: 4px 0 0; color: #64748b; font-size: 10px; font-weight: 800; }
    .pill { border-radius: 4px; padding: 6px 8px; color: #fff; background: #f97316; font-size: 9px; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    .pill.safety-major { background: #ef4444; }
    .pill.maintenance-monitor { background: #0f8f8f; }
    .pill.informational { background: #2563eb; }
    .finding-body { display: grid; grid-template-columns: 1fr 225px; gap: 16px; align-items: start; }
    .finding-copy { display: grid; gap: 8px; }
    .finding-note { border-left: 3px solid #0f8f8f; padding-left: 10px; }
    .finding-note b { display: block; color: #0f8f8f; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
    .finding-note p { margin: 3px 0 0; color: #334155; white-space: pre-line; }
    .finding-note.recommendation { border-left-color: #f97316; }
    .finding-note.recommendation b { color: #f97316; }
    .finding-photos { display: grid; gap: 8px; }
    .finding-photos img { width: 100%; max-height: 174px; object-fit: contain; border: 1px solid #cbd5e1; background: #fff; }

    .interactive-card { margin: 120px auto 0; max-width: 420px; text-align: center; }
    .interactive-icon { width: 90px; height: 90px; margin: 0 auto 18px; border-radius: 999px; background: #0f8f8f; color: white; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; }
    .qr-caption { margin: 22px 0 0; color: #020617; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
    .qr-box { width: 180px; height: 180px; margin: 24px auto; border: 2px dashed #0f8f8f; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #0f8f8f; font-weight: 900; }
    .qr-box.real { width: 220px; height: 220px; margin: 16px auto 14px; background: #fff; border: 0; border-radius: 18px; display: flex; justify-content: center; align-items: center; position: relative; padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
    .qr-image { width: 100%; height: 100%; object-fit: contain; display: block; }
    .qr-logo { position: absolute; width: 58px; height: 58px; background: #fff; border-radius: 14px; display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: 0 0 8px rgba(0,0,0,.2); }
    .qr-logo img { width: 46px; height: 46px; object-fit: contain; display: block; }
    .online-link { color: #0f8f8f; overflow-wrap: anywhere; font-weight: 800; }

    .black-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 36px; background: #020617; color: #cbd5e1; display: flex; align-items: center; justify-content: space-between; padding: 0 46px; font-size: 9px; }
    .teal-line { position: absolute; left: 46px; right: 46px; bottom: 42px; border-top: 1px solid #0f8f8f; }

    @media (max-width: 840px) {
      .document, .page { width: 100%; }
      .page { min-height: auto; overflow: visible; padding: 24px 20px 70px; break-after: auto; page-break-after: auto; }
      .cover-photo { width: 100%; height: auto; max-height: 320px; }
      .cover-details, .summary-cards, .section-info-strip { grid-template-columns: 1fr; }
      .finding-body, .finding-title-row { grid-template-columns: 1fr; }
      .black-footer { padding: 0 20px; }
    }

    @media print {
      body { background: #fff; }
      .screen-actions { display: none; }
      .document { width: 8.5in; margin: 0; box-shadow: none; background: #fff; }
      .page { width: 8.5in; min-height: 11in; overflow: hidden; }
    }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print / Save PDF</button>
  </div>

  <main class="document">
    <section class="page cover-page">
      <div class="cover-top">
        ${coverLogoHtml}
        <div class="company">
          <strong>${escapeHtml(companyName)}</strong><br/>
          ${companyPhone ? `${escapeHtml(companyPhone)}<br/>` : ""}
          ${companyEmail ? `${escapeHtml(companyEmail)}<br/>` : ""}
          ${companyWebsite ? `${escapeHtml(companyWebsite)}<br/>` : ""}
          ${licenseInfo ? `<span>${escapeHtml(licenseInfo)}</span>` : ""}
        </div>
      </div>

      ${coverPhotoHtml}

      <p class="cover-eyebrow">${isFull ? "Residential Inspection Report" : "Agent Friendly Report"}</p>
      <h1>${escapeHtml(property)}</h1>
      <p class="cover-address">${escapeHtml(cityStateZip || "Inspection Location")}</p>
      <hr class="cover-rule" />

      <div class="cover-details">
        <div class="detail-card"><span>Inspector</span><strong>${escapeHtml(inspectorName)}</strong></div>
        <div class="detail-card"><span>Client</span><strong>${escapeHtml(clientName)}</strong></div>
        <div class="detail-card"><span>Realtor</span><strong>${escapeHtml(realtorName)}</strong></div>
        <div class="detail-card"><span>Inspection Date</span><strong>${escapeHtml(inspectionDate)}</strong></div>
        <div class="detail-card"><span>Report Type</span><strong>${isFull ? "Full Report" : "Agent Report"}</strong></div>
        <div class="detail-card"><span>Report ID</span><strong>${escapeHtml(reportId || "N/A")}</strong></div>
      </div>

      <div class="teal-line"></div>
      <footer class="black-footer">
        <span>${escapeHtml(footerBranding)}</span>
        <span>${escapeHtml(companyName)}</span>
      </footer>
    </section>

    ${isFull ? `
    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>
      <h2 class="toc-title">Table of Contents</h2>
      ${tocHtml || "<p>No sections with findings.</p>"}
      <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>Table of Contents</span></footer>
    </section>
    ` : ""}

    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>

      <h2 class="summary-title">Summary</h2>
      ${summaryCards}

      <h2 class="summary-title">Key Findings</h2>
      <ul class="key-findings">
        ${keyFindingsHtml || "<li>No report findings were found.</li>"}
      </ul>

      <footer class="black-footer">
        <span>Summary</span>
        <span>${defects.length} documented finding${defects.length === 1 ? "" : "s"}</span>
      </footer>
    </section>

    ${pagesHtml || `
      <section class="page">
        <header class="page-header">
          <div class="mini-brand">${headerLogoHtml}</div>
          <div class="header-address">${escapeHtml(property)}</div>
        </header>
        <h2>No Findings</h2>
        <p>No report findings were found.</p>
        <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>No Findings</span></footer>
      </section>
    `}

    ${isFull && onlineReportUrl ? `
    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>

      <div class="interactive-card">
        <div class="interactive-icon">↗</div>
        <h2 class="summary-title">Interactive Online Report</h2>
        <p>View the complete online report with photos, videos, repair requests, addenda, and client-friendly tools.</p>
        <p class="qr-caption">Scan to View Full Inspection Report</p>
        ${qrHtml}
        <p class="online-link">${escapeHtml(onlineReportUrl)}</p>
      </div>

      <footer class="black-footer">
        <span>Interactive Report</span>
        <span>${escapeHtml(companyName)}</span>
      </footer>
    </section>
    ` : ""}
  </main>
</body>
</html>`;
}


async function renderHtmlToPdf(html: string) {
  let browser: any = null;

  try {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      (await chromium.executablePath());

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 816,
        height: 1056,
        deviceScaleFactor: 1,
      },
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 90000,
    });

    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function getDownloadName(property: string, reportMode: "agent" | "full") {
  const slug = cleanText(property)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return `${slug || "inspection-report"}-${reportMode === "full" ? "full-report" : "agent-report"}.pdf`;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const lookupValue = cleanText(id);
    const url = new URL(req.url);
    const reportMode = url.searchParams.get("type") === "full" ? "full" : "agent";

    if (!lookupValue) {
      return NextResponse.json({ error: "Missing report token." }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const admin = createAdminClient();

    // Public downloads are authorized by the same secure report token used to open the share page.
    // Numeric IDs are only accepted for logged-in inspectors/linked realtor portal users.
    // Look up token columns one at a time so a missing legacy column does not break all public downloads.
    let tokenInspection: any = null;

    const tokenColumns = [
      "public_share_token",
      "share_token",
      "report_share_token",
    ];

    for (const column of tokenColumns) {
      const { data, error } = await admin
        .from("inspections")
        .select("*")
        .eq(column, lookupValue)
        .maybeSingle();

      if (data) {
        tokenInspection = data;
        break;
      }

      if (error) {
        console.warn(`Skipping secure report token lookup for ${column}:`, error.message);
      }
    }

    let inspection = tokenInspection || null;
    let inspectionId = inspection ? cleanText(inspection.id) : "";
    let allowedByShareToken = Boolean(inspection);
    let user: any = null;
    let userEmail = "";

    if (!inspection) {
      if (!/^\d+$/.test(lookupValue)) {
        return NextResponse.json({ error: "Report link is invalid or expired." }, { status: 404 });
      }

      const authClient = await createSupabaseServerClient();
      const authResult = await authClient.auth.getUser();
      user = authResult.data.user;
      userEmail = cleanEmail(user?.email);

      if (!user?.email) {
        return NextResponse.json({ error: "This download link requires a valid shared report link." }, { status: 401 });
      }

      inspectionId = lookupValue;

      const { data: inspectionById, error: inspectionError } = await admin
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .maybeSingle();

      if (inspectionError || !inspectionById) {
        return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
      }

      inspection = inspectionById;
    }

    if (!inspection || !inspectionId) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    let secureShareToken = getInspectionShareToken(inspection);

    // Only create a missing token when a logged-in authorized user is downloading by numeric ID.
    // Public/token downloads never expose or create predictable numeric access.
    if (!secureShareToken && !allowedByShareToken && user?.email) {
      secureShareToken = randomUUID().replace(/-/g, "");

      const { error: tokenError } = await admin
        .from("inspections")
        .update({ public_share_token: secureShareToken })
        .eq("id", inspectionId);

      if (tokenError) {
        console.error("Secure share token create error:", tokenError);
      } else {
        inspection.public_share_token = secureShareToken;
      }
    }

    let allowed = allowedByShareToken;

    if (!allowed) {
      allowed =
        inspectionBelongsToUser(inspection, user) ||
        inspectionHasRealtorEmail(inspection, userEmail);
    }

    if (!allowed && userEmail) {
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

    const branding = await loadCompanyBranding(admin, inspection, userEmail);

    const secureOnlineReportUrl = onlineReportUrlForInspection(inspection);

    const qrCodeDataUrl =
      reportMode === "full" && secureOnlineReportUrl
        ? await QRCode.toDataURL(secureOnlineReportUrl, {
            errorCorrectionLevel: "H",
            margin: 1,
            width: 420,
            color: {
              dark: "#18c8bf",
              light: "#ffffff",
            },
          })
        : "";

    const html = buildAgentReportHtml({
      inspection,
      findings,
      reportMode,
      propertyPhotoUrl,
      branding,
      qrCodeDataUrl,
    });
    const property = getPropertyAddress(inspection);

    const pdf = await renderHtmlToPdf(html);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
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
