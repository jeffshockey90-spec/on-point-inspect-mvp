import { createClient } from "@supabase/supabase-js";
import RepairResponseForm from "./RepairResponseForm";
import { getCompanyBrandingById } from "../../../lib/companyBranding";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    token: string;
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

function getSectionNumber(sectionValue: any) {
  const section = normalizeSection(sectionValue);
  const index = SECTION_ORDER.findIndex(
    (item) => item.toLowerCase() === section.toLowerCase()
  );

  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
}

function getFindingNumber(finding: any, fallbackIndex = 0) {
  const existing =
    finding?.item_number ||
    finding?.finding_number ||
    finding?.repair_item_number ||
    finding?.report_item_number ||
    finding?.reference_number;

  if (existing) return String(existing);

  const sectionNumber = getSectionNumber(finding?.section);
  return `${sectionNumber}.1.${fallbackIndex + 1}`;
}

function parseMoneyValue(value: any) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: any) {
  const number = parseMoneyValue(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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

function getRequestedCreditsFromShare(share: any) {
  const direct = share?.requested_credits;
  const metadata = share?.metadata?.requested_credits;

  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata;

  return {};
}

function getRequestedCreditTotalFromShare(share: any, findings: any[]) {
  const direct = parseMoneyValue(share?.requested_credit_total);
  const metadata = parseMoneyValue(share?.metadata?.requested_credit_total);

  if (direct > 0) return direct;
  if (metadata > 0) return metadata;

  return findings.reduce(
    (sum, finding) => sum + parseMoneyValue(finding?.requested_credit_amount),
    0
  );
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
      <main className="min-h-screen bg-[#0a0e13] p-4 text-white md:p-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
          <h1 className="text-2xl font-semibold text-red-200">Repair Request Not Found</h1>
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

  const branding = await getCompanyBrandingById(inspection?.company_id);

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

  const requestedCredits = getRequestedCreditsFromShare(share);

  const findings = orderedFindings.map((finding: any, index: number) => {
    const itemNumber = getFindingNumber(finding, index);
    const requestedCredit = requestedCredits[cleanText(finding.id)] || "";

    return {
      ...finding,
      section: normalizeSection(finding.section),
      item_number: itemNumber,
      finding_number: itemNumber,
      repair_item_number: itemNumber,
      report_item_number: itemNumber,
      requested_credit_amount: requestedCredit,
      requested_credit_display: formatMoney(requestedCredit),
      property_address: propertyAddress,
      photos: photoMap.get(cleanText(finding.id)) || [],
    };
  });

  const requestedCreditTotal = getRequestedCreditTotalFromShare(share, findings);

  const shareMetadata =
    share?.metadata && typeof share.metadata === "object" && !Array.isArray(share.metadata)
      ? share.metadata
      : {};

  const existingSignatures = shareMetadata.repair_request_signatures || null;

  const { data: responsesRaw } = await admin
    .from("repair_request_responses")
    .select("*")
    .eq("share_id", share.id);

  const responses = Array.isArray(responsesRaw) ? responsesRaw : [];

  const addendumEmailRecipients = [
    {
      value: "repair-recipient",
      label: share.recipient_email
        ? `Repair Request Recipient - ${share.recipient_email}`
        : "Repair Request Recipient",
      email: share.recipient_email || "",
    },
    {
      value: "client",
      label: inspection?.client_email
        ? `Client - ${inspection.client_email}`
        : "Client",
      email: inspection?.client_email || "",
    },
    {
      value: "co-client",
      label: inspection?.co_client_email
        ? `Co-Buyer - ${inspection.co_client_email}`
        : "Co-Buyer",
      email: inspection?.co_client_email || "",
    },
    {
      value: "realtor",
      label: inspection?.realtor_email
        ? `Realtor - ${inspection.realtor_email}`
        : "Realtor",
      email: inspection?.realtor_email || inspection?.agent_email || "",
    },
    {
      value: "listing-agent",
      label: inspection?.listing_agent_email
        ? `Listing Agent - ${inspection.listing_agent_email}`
        : "Listing Agent",
      email: inspection?.listing_agent_email || "",
    },
  ]
    .filter((item) => String(item.email || "").includes("@"))
    .filter((item, index, array) => {
      const email = String(item.email || "").toLowerCase();
      return array.findIndex((next) => String(next.email || "").toLowerCase() === email) === index;
    });

  const alreadySubmitted =
    String(share.status || "").toLowerCase() === "completed" ||
    Boolean(share.responded_at);

  return (
    <main className="min-h-screen bg-[#0a0e13] p-4 pb-20 text-white md:p-8">
      <section className="mx-auto mb-5 max-w-5xl rounded-2xl border border-[#232b38] bg-[#10151e] p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-300">
          {branding.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Repair Request Response
        </h1>
        <p className="mt-2 text-[#e8ecf3]">{propertyAddress}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase text-blue-200">Selected Items</p>
            <p className="mt-2 font-semibold text-white">{selectedIds.length}</p>
          </div>
          <div className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase text-blue-200">Requested Credit</p>
            <p className="mt-2 font-semibold text-white">{formatMoney(requestedCreditTotal)}</p>
          </div>
          <div className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase text-blue-200">Recipient</p>
            <p className="mt-2 break-words font-semibold text-white">
              {share.recipient_email || "Secure recipient"}
            </p>
          </div>
          <div className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase text-blue-200">Status</p>
            <p className="mt-2 font-semibold text-white">
              {alreadySubmitted ? "completed" : share.status || "sent"}
            </p>
          </div>
        </div>

        {findings.length > 0 ? (
          <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
              Repair Items
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {findings.map((finding: any) => (
                <span
                  key={finding.id}
                  className="rounded-full border border-cyan-400/50 bg-[#0a0e13] px-3 py-1 text-xs font-semibold text-cyan-200"
                >
                  Item #{finding.item_number}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {share.summary ? (
          <div className="mt-5 rounded-xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase text-blue-200">Summary</p>
            <p className="mt-3 whitespace-pre-line leading-7 text-white">{share.summary}</p>
          </div>
        ) : null}
      </section>

      <RepairResponseForm
        token={cleanToken}
        findings={findings}
        existingResponses={responses}
        alreadySubmitted={alreadySubmitted}
        existingSignatures={existingSignatures}
        addendumEmailRecipients={addendumEmailRecipients}
      />
    </main>
  );
}
