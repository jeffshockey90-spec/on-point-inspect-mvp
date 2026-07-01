import { createClient } from "@supabase/supabase-js";
import RepairResponseForm from "./RepairResponseForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function createAdminClient() {
  return createClient(
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

function getStoragePathFromUrl(url: string | null | undefined) {
  const clean = cleanText(url);
  if (!clean) return "";

  const markers = [
    "/storage/v1/object/public/inspection-photos/",
    "/storage/v1/object/sign/inspection-photos/",
    "/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = clean.indexOf(marker);
    if (index !== -1) {
      return decodeURIComponent(clean.substring(index + marker.length).split("?")[0]);
    }
  }

  return clean;
}

async function signedPhotoUrl(db: any, rawValue: any) {
  const clean = cleanText(rawValue);
  if (!clean) return "";

  if (clean.startsWith("data:image/")) return clean;

  const path = getStoragePathFromUrl(clean);

  if (!path) return "";

  try {
    const { data } = await db.storage
      .from("inspection-photos")
      .createSignedUrl(path, 60 * 60 * 24);

    if (data?.signedUrl) return data.signedUrl;
  } catch {}

  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

  return "";
}

async function loadPhotosForFindings(db: any, findingIds: string[]) {
  if (!findingIds.length) return new Map<string, any[]>();

  const photoMap = new Map<string, any[]>();

  async function addRows(rows: any[] | null | undefined) {
    for (const row of rows || []) {
      const findingId = cleanText(row.finding_id || row.findingId);
      if (!findingId) continue;

      const rawUrl =
        row.signed_url ||
        row.signedUrl ||
        row.url ||
        row.photo_url ||
        row.image_url ||
        row.storage_path ||
        row.path ||
        row.file_path;

      const signedUrl = await signedPhotoUrl(db, rawUrl);
      if (!signedUrl) continue;

      const current = photoMap.get(findingId) || [];
      current.push({
        ...row,
        signed_url: signedUrl,
        url: signedUrl,
      });
      photoMap.set(findingId, current);
    }
  }

  // Main table used by most finding photo workflows.
  try {
    const { data } = await db
      .from("finding_photos")
      .select("*")
      .in("finding_id", findingIds)
      .order("created_at", { ascending: true });

    await addRows(data);
  } catch {}

  // Fallback used in some earlier versions of this app.
  try {
    const { data } = await db
      .from("inspection_photos")
      .select("*")
      .in("finding_id", findingIds)
      .order("created_at", { ascending: true });

    await addRows(data);
  } catch {}

  return photoMap;
}

function groupFindingsInSelectedOrder(findings: any[], selectedIds: string[]) {
  const byId = new Map(findings.map((finding) => [cleanText(finding.id), finding]));

  return selectedIds
    .map((id) => byId.get(cleanText(id)))
    .filter(Boolean);
}

export default async function RepairResponsePage({ params }: PageProps) {
  const { token } = await params;
  const cleanToken = cleanText(token);
  const db = createAdminClient();

  const { data: share, error: shareError } = await db
    .from("repair_request_shares")
    .select("*")
    .eq("token", cleanToken)
    .maybeSingle();

  if (shareError || !share) {
    return (
      <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-red-200">Repair Request Not Found</h1>
          <p className="mt-3 text-red-100">
            This secure repair request link is invalid or no longer available.
          </p>
        </section>
      </main>
    );
  }

  const inspectionId = share.inspection_id;
  const selectedIds = Array.isArray(share.selected_finding_ids)
    ? share.selected_finding_ids.map((id: any) => cleanText(id)).filter(Boolean)
    : [];

  const { data: inspection } = await db
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();

  const { data: findingsRaw } = await db
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .in("id", selectedIds.length ? selectedIds : ["__none__"]);

  const orderedFindings = groupFindingsInSelectedOrder(findingsRaw || [], selectedIds);
  const photoMap = await loadPhotosForFindings(
    db,
    orderedFindings.map((finding: any) => cleanText(finding.id))
  );

  const findings = orderedFindings.map((finding: any) => {
    const photos = photoMap.get(cleanText(finding.id)) || [];

    return {
      ...finding,
      photos,
    };
  });

  const { data: responsesRaw } = await db
    .from("repair_request_responses")
    .select("*")
    .eq("share_id", share.id);

  const responses = Array.isArray(responsesRaw) ? responsesRaw : [];

  return (
    <main className="min-h-screen bg-[#020617] p-4 pb-20 text-white md:p-8">
      <RepairResponseForm
        token={cleanToken}
        share={share}
        inspection={inspection || null}
        findings={findings}
        existingResponses={responses}
      />
    </main>
  );
}
