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
  if (!url) return "";
  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.substring(index + marker.length).split("?")[0]);
}

async function loadPhotosForFindings(admin: any, findingIds: string[]) {
  if (!findingIds.length) return new Map<string, any[]>();

  const { data: photosRaw } = await admin
    .from("photos")
    .select("*")
    .in("finding_id", findingIds);

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

  return photosWithUrls.reduce((acc: Map<string, any[]>, photo: any) => {
    const findingId = cleanText(photo.finding_id);
    if (!findingId) return acc;

    const existing = acc.get(findingId) || [];
    existing.push(photo);
    acc.set(findingId, existing);

    return acc;
  }, new Map<string, any[]>());
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
  const admin = createAdminClient();

  const { data: share, error: shareError } = await admin
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

  const { data: inspection } = await admin
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();

  const { data: findingsRaw } = await admin
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .in("id", selectedIds.length ? selectedIds : ["__none__"]);

  const orderedFindings = groupFindingsInSelectedOrder(findingsRaw || [], selectedIds);
  const photoMap = await loadPhotosForFindings(
    admin,
    orderedFindings.map((finding: any) => cleanText(finding.id))
  );

  const propertyAddress =
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection property";

  const findings = orderedFindings.map((finding: any) => ({
    ...finding,
    property_address: propertyAddress,
    photos: photoMap.get(cleanText(finding.id)) || [],
  }));

  const { data: responsesRaw } = await admin
    .from("repair_request_responses")
    .select("*")
    .eq("share_id", share.id);

  const responses = Array.isArray(responsesRaw) ? responsesRaw : [];
  const alreadySubmitted =
    String(share.status || "").toLowerCase() === "completed" ||
    Boolean(share.responded_at);

  return (
    <main className="min-h-screen bg-[#020617] p-4 pb-20 text-white md:p-8">
      <section className="mx-auto mb-5 max-w-5xl rounded-2xl border border-slate-700 bg-[#0f172a] p-5 md:p-6">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
          On Point Home Inspections
        </p>
        <h1 className="mt-3 text-3xl font-black text-white">
          Repair Request Response
        </h1>
        <p className="mt-2 text-slate-200">{propertyAddress}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4">
            <p className="text-xs font-black uppercase text-blue-200">Selected Items</p>
            <p className="mt-2 font-black text-white">{selectedIds.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4">
            <p className="text-xs font-black uppercase text-blue-200">Recipient</p>
            <p className="mt-2 break-words font-black text-white">
              {share.recipient_email || "Secure recipient"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4">
            <p className="text-xs font-black uppercase text-blue-200">Status</p>
            <p className="mt-2 font-black text-white">
              {alreadySubmitted ? "completed" : share.status || "sent"}
            </p>
          </div>
        </div>

        {share.summary ? (
          <div className="mt-5 rounded-xl border border-slate-700 bg-[#020617] p-4">
            <p className="text-xs font-black uppercase text-blue-200">Summary</p>
            <p className="mt-3 whitespace-pre-line leading-7 text-white">{share.summary}</p>
          </div>
        ) : null}
      </section>

      <RepairResponseForm
        token={cleanToken}
        findings={findings}
        existingResponses={responses}
        alreadySubmitted={alreadySubmitted}
      />
    </main>
  );
}
