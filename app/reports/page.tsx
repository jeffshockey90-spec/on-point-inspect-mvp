
import { formatAppValue } from "../../lib/app-time";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import DeleteInspectionButton from "../../components/DeleteInspectionButton";
import FastLinkButton from "../../components/FastLinkButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const cleanUrl = String(url).split("?")[0];
  const marker = "/inspection-photos/";
  const index = cleanUrl.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(cleanUrl.substring(index + marker.length));
}

function getInspectionPropertyPhoto(inspection: any) {
  return (
    // Custom/uploaded property photo fields first
    inspection.property_photo_override ||
    inspection.property_photo_override_url ||
    inspection.custom_property_photo ||
    inspection.custom_photo_url ||
    inspection.property_image ||
    inspection.property_image_url ||
    inspection.property_photo_url ||
    inspection.property_photo ||
    inspection.cover_photo_url ||

    // Lookup / fallback images after custom photos
    inspection.google_photo_url ||
    inspection.place_photo_url ||
    inspection.street_view_url ||
    inspection.streetview_url ||
    inspection.streetview_image ||
    inspection.image_url ||
    inspection.photo_url ||
    inspection.cover_image ||
    inspection.hero_image ||
    inspection.report_image ||
    ""
  );
}

const propertyPhotoSignedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const PROPERTY_PHOTO_CACHE_TTL_MS = 1000 * 60 * 45;

async function createSignedPropertyPhotoMap(supabase: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const now = Date.now();
  const missingPaths: string[] = [];

  uniquePaths.forEach((path) => {
    const cached = propertyPhotoSignedUrlCache.get(path);

    if (cached && cached.expiresAt > now) {
      signedMap[path] = cached.url;
      return;
    }

    missingPaths.push(path);
  });

  if (missingPaths.length === 0) return signedMap;

  const { data, error } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrls(missingPaths, 60 * 60 * 24 * 7, {
      transform: {
        width: 700,
        resize: "cover",
      },
    });

  if (error) {
    console.error("Reports property photo signing error:", error);
    return signedMap;
  }

  (data || []).forEach((item: any, index: number) => {
    const path = item?.path || missingPaths[index];

    if (path && item?.signedUrl) {
      signedMap[path] = item.signedUrl;
      propertyPhotoSignedUrlCache.set(path, {
        url: item.signedUrl,
        expiresAt: now + PROPERTY_PHOTO_CACHE_TTL_MS,
      });
    }
  });

  return signedMap;
}

function getViewType(log: any) {
  return String(log?.view_type || "").toLowerCase();
}

function formatViewDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRelativeTime(value: any) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatViewDate(value);
}

function buildReportActivityMap(viewLogs: any[]) {
  const map: Record<
    string,
    {
      totalViews: number;
      clientViewed: boolean;
      realtorViewed: boolean;
      inspectorViewed: boolean;
      emailClicked: boolean;
      lastViewedAt: string | null;
    }
  > = {};

  (viewLogs || []).forEach((log: any) => {
    const inspectionId = String(log?.inspection_id_bigint || log?.inspection_id || "");
    if (!inspectionId) return;

    if (!map[inspectionId]) {
      map[inspectionId] = {
        totalViews: 0,
        clientViewed: false,
        realtorViewed: false,
        inspectorViewed: false,
        emailClicked: false,
        lastViewedAt: null,
      };
    }

    const type = getViewType(log);
    const role = String(log?.viewer_role || "").toLowerCase();

    const isReportView =
      type === "client_portal" ||
      type === "report_share" ||
      type === "environmental_share";

    if (isReportView) {
      map[inspectionId].totalViews += 1;

      if (!map[inspectionId].lastViewedAt) {
        map[inspectionId].lastViewedAt = log.created_at || null;
      }
    }

    if (
      type === "client_portal" ||
      (type === "report_share" && role === "client") ||
      (type === "environmental_share" && role === "client")
    ) {
      map[inspectionId].clientViewed = true;
    }

    if (
      (type === "report_share" && (role === "realtor" || role === "agent")) ||
      (type === "environmental_share" && (role === "realtor" || role === "agent"))
    ) {
      map[inspectionId].realtorViewed = true;
    }

    if (
      role === "inspector" ||
      (isReportView && !role && !log?.viewer_email)
    ) {
      map[inspectionId].inspectorViewed = true;
    }

    if (type === "email_click") {
      map[inspectionId].emailClicked = true;
    }
  });

  return map;
}

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email || "";

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .or(
      `inspector_id.eq.${user.id},client_email.eq.${userEmail},realtor_email.eq.${userEmail}`
    )
    .or("is_demo.is.null,is_demo.eq.false")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        <h1 className="text-3xl font-bold text-red-400">
          Error loading reports
        </h1>
        <p className="mt-4 text-slate-300">{error.message}</p>
      </main>
    );
  }

  const rows = inspections || [];
  const storageSupabase = createSupabaseStorageClient() || supabase;
  const propertyPhotoPaths = rows
    .map((inspection: any) => getStoragePathFromUrl(getInspectionPropertyPhoto(inspection)))
    .filter(Boolean);
  const signedPropertyPhotoMap = await createSignedPropertyPhotoMap(
    storageSupabase,
    propertyPhotoPaths
  );

  const inspectionIds = rows
    .map((inspection: any) => Number(inspection.id))
    .filter(Boolean);

  const { data: viewLogsRaw, error: viewLogsError } =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_view_events")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [], error: null };

  if (viewLogsError) {
    console.error("Reports page view logs error:", viewLogsError);
  }

  const activityByInspectionId = buildReportActivityMap(viewLogsRaw || []);
  const reportsViewedCount = Object.values(activityByInspectionId).filter(
    (activity: any) => activity.totalViews > 0
  ).length;
  const clientViewedCount = Object.values(activityByInspectionId).filter(
    (activity: any) => activity.clientViewed
  ).length;
  const realtorViewedCount = Object.values(activityByInspectionId).filter(
    (activity: any) => activity.realtorViewed
  ).length;

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold text-teal-400">
              Saved Inspections
            </h1>

            <p className="mt-3 text-slate-300">
              Manage inspection reports, publishing, client delivery, and live report engagement.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <FastLinkButton
              href="/inspections/new"
              loadingText="Opening..."
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black hover:bg-teal-400"
            >
              New Inspection
            </FastLinkButton>

            <FastLinkButton
              href="/demo-reports"
              loadingText="Opening Demos..."
              className="rounded-xl border border-cyan-500 bg-cyan-500/10 px-6 py-3 font-bold text-cyan-300 hover:bg-cyan-500/20"
            >
              Demo Reports
            </FastLinkButton>

            <FastLinkButton
              href="/import-report"
              loadingText="Opening Importer..."
              className="rounded-xl border border-amber-500 bg-amber-500/10 px-6 py-3 font-bold text-amber-300 hover:bg-amber-500/20"
            >
              Import Report
            </FastLinkButton>
          </div>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <ReportMetric label="Total Reports" value={String(rows.length)} />
          <ReportMetric label="Viewed Reports" value={String(reportsViewedCount)} />
          <ReportMetric label="Client Viewed" value={String(clientViewedCount)} />
          <ReportMetric label="Realtor Viewed" value={String(realtorViewedCount)} />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <p className="text-slate-300">No saved inspections found.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {rows.map((inspection: any, index: number) => {
              const isInspectorOwner =
                inspection.inspector_id && inspection.inspector_id === user.id;

              const propertyPhotoRaw = getInspectionPropertyPhoto(inspection);
              const propertyPhotoPath = getStoragePathFromUrl(propertyPhotoRaw);
              const propertyPhoto =
                signedPropertyPhotoMap[propertyPhotoPath] || propertyPhotoRaw || "";

              const activity =
                activityByInspectionId[String(inspection.id)] || {
                  totalViews: 0,
                  clientViewed: false,
                  realtorViewed: false,
                  inspectorViewed: false,
                  emailClicked: false,
                  lastViewedAt: null,
                };

              return (
                <div
                  key={inspection.id}
                  className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl transition duration-150 hover:-translate-y-0.5 hover:border-teal-500/70 hover:bg-[#13213a] hover:shadow-[0_0_28px_rgba(20,184,166,0.14)] active:scale-[0.99]"
                >
                  <div className="relative flex h-56 items-center justify-center overflow-hidden bg-slate-950 text-slate-500">
                    {!propertyPhoto ? (
                      <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-slate-500">
                        No Property Photo
                      </span>
                    ) : null}

                    {propertyPhoto ? (
                      <img
                        src={propertyPhoto}
                        alt="Property"
                        loading={index < 8 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index < 4 ? "high" : "auto"}
                        className="relative z-10 h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                      />
                    ) : null}
                  </div>

                  <div className="p-6">
                    <h2 className="text-2xl font-bold text-white transition group-hover:text-teal-300">
                      {inspection.property_address || "Untitled Inspection"}
                    </h2>

                    <p className="mt-3 text-slate-300">
                      {inspection.city || ""}
                      {inspection.state ? `, ${inspection.state}` : ""}{" "}
                      {inspection.zip || ""}
                    </p>

                    <div className="mt-5 space-y-2 text-sm text-slate-300">
                      <p>
                        <span className="font-bold text-white">Client:</span>{" "}
                        {inspection.client_name || "N/A"}
                      </p>

                      <p>
                        <span className="font-bold text-white">Realtor:</span>{" "}
                        {inspection.realtor_name || "N/A"}
                      </p>

                      <p>
                        <span className="font-bold text-white">
                          Inspection Date:
                        </span>{" "}
                        {inspection.inspection_date || "N/A"}
                      </p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-800 bg-[#020617]/70 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                        Report Engagement
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <EngagementBadge
                          active={activity.clientViewed}
                          activeLabel="👤 Client Viewed"
                          inactiveLabel="👤 Client Not Viewed"
                        />

                        <EngagementBadge
                          active={activity.realtorViewed}
                          activeLabel="🏡 Realtor Viewed"
                          inactiveLabel="🏡 Realtor Not Viewed"
                        />

                        <EngagementBadge
                          active={activity.emailClicked}
                          activeLabel="📧 Email Clicked"
                          inactiveLabel="📧 No Email Click"
                        />

                        {activity.inspectorViewed && (
                          <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-300">
                            🔎 Inspector Viewed
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-400">
                        <p>
                          <span className="font-bold text-slate-300">Views:</span>{" "}
                          {activity.totalViews}
                        </p>

                        <p>
                          <span className="font-bold text-slate-300">Last View:</span>{" "}
                          {activity.lastViewedAt
                            ? getRelativeTime(activity.lastViewedAt)
                            : "No views yet"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                      <FastLinkButton
                        href={`/reports/${inspection.id}`}
                        loadingText="Opening Report..."
                        className="rounded-xl bg-teal-500 px-5 py-3 text-center font-bold text-black hover:bg-teal-400"
                      >
                        Open Report
                      </FastLinkButton>

                      {isInspectorOwner && (
                        <DeleteInspectionButton inspectionId={inspection.id} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl transition duration-150 hover:border-teal-500/50 hover:bg-[#13213a] active:scale-[0.985]">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function EngagementBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-black text-green-300"
          : "rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-black text-slate-400"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
