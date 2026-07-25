import { OWNER_EMAILS } from "../../lib/ownerEmails";

import { formatAppValue } from "../../lib/app-time";
import FastLinkButton from "../../components/FastLinkButton";
import EmailAddendumButton from "../../components/EmailAddendumButton";
import ReportDownloadLink from "../../components/ReportDownloadLink";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value) || "N/A";

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInspectionDate(inspection: any) {
  return (
    inspection?.inspection_date ||
    inspection?.scheduled_date ||
    inspection?.created_at ||
    ""
  );
}

function getPropertyAddress(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Untitled Inspection"
  );
}

function getClientName(inspection: any) {
  return (
    inspection?.client_name ||
    inspection?.client ||
    inspection?.buyer_name ||
    "Client not listed"
  );
}

function getReportStatus(inspection: any) {
  const status = cleanText(
    inspection?.report_status ||
      inspection?.status ||
      inspection?.inspection_status ||
      ""
  );

  if (!status) return "Inspection";

  return status;
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

function uniqById(items: any[]) {
  const map = new Map<string, any>();

  for (const item of items) {
    const id = cleanText(item?.id);
    if (!id) continue;
    if (!map.has(id)) map.set(id, item);
  }

  return Array.from(map.values());
}

function getShareRequestedTotal(share: any) {
  return parseMoneyValue(
    share?.requested_credit_total ?? share?.metadata?.requested_credit_total ?? 0
  );
}

function getShareSellerTotal(share: any) {
  return parseMoneyValue(
    share?.seller_credit_total ?? share?.metadata?.seller_credit_total ?? 0
  );
}

function getResponseSellerTotal(responses: any[]) {
  return (responses || []).reduce(
    (sum: number, response: any) =>
      sum +
      parseMoneyValue(
        response?.seller_credit_amount ??
          response?.credit_amount ??
          response?.metadata?.seller_credit_amount ??
          0
      ),
    0
  );
}

function getShareItemCount(share: any) {
  return Array.isArray(share?.selected_finding_ids)
    ? share.selected_finding_ids.length
    : 0;
}

function getShareNumber(index: number, total: number) {
  return `Repair Request #${Math.max(1, total - index)}`;
}

function getRepairRequestCreatorLabel(share: any) {
  const metadata =
    share?.metadata && typeof share.metadata === "object" && !Array.isArray(share.metadata)
      ? share.metadata
      : {};

  const role = cleanText(
    share?.created_by_role ||
      metadata?.created_by_role ||
      "inspector"
  );

  const name = cleanText(
    share?.created_by_name ||
      metadata?.created_by_name ||
      share?.created_by_email ||
      metadata?.created_by_email ||
      ""
  );

  const label = role.toLowerCase().includes("realtor") ? "Realtor" : "Inspector";

  return name ? `${label}: ${name}` : label;
}

function getRepairStatus(share: any) {
  const status = cleanText(share?.status || "sent").toLowerCase();
  if (share?.responded_at || status === "responded" || status === "completed") return "responded";
  if (status.includes("view")) return "viewed";
  if (status.includes("failed")) return "failed";
  return "sent";
}

function getStatusBadge(status: string) {
  if (status === "responded") {
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "viewed") {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-200";
  }

  if (status === "failed") {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }

  return "border-blue-500/50 bg-blue-500/10 text-blue-200";
}

function getStatusLabel(status: string) {
  if (status === "responded") return "Addendum Ready";
  if (status === "viewed") return "Viewed";
  if (status === "failed") return "Failed";
  return "Sent";
}

export default async function RealtorPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = cleanEmail(user.email);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const previewEmail = cleanEmail(resolvedSearchParams?.preview);
  const isOwnerPreview = OWNER_EMAILS.includes(userEmail) && Boolean(previewEmail);
  const lookupEmail = isOwnerPreview ? previewEmail : userEmail;

  if (!lookupEmail) {
    return (
      <main className="min-h-screen bg-[#020617] px-5 py-10 text-white">
        <section className="mx-auto max-w-4xl rounded-3xl border border-red-500/40 bg-red-500/10 p-8">
          <h1 className="text-3xl font-black text-red-200">Realtor Portal</h1>
          <p className="mt-3 text-red-100">
            Your account does not have an email address attached.
          </p>
        </section>
      </main>
    );
  }

  const admin = createAdminClient();

  const { data: contactMatchesRaw } = await admin
    .from("inspection_contacts")
    .select("*")
    .ilike("email", lookupEmail);

  const contactMatches = (contactMatchesRaw || []).filter((contact: any) => {
    if (contact?.portal_access === false) return false;
    return roleLooksLikeRealtor(contact?.role);
  });

  const contactInspectionIds = contactMatches
    .map((contact: any) => cleanText(contact.inspection_id))
    .filter(Boolean);

  let inspectionsFromContacts: any[] = [];

  if (contactInspectionIds.length) {
    const { data } = await admin
      .from("inspections")
      .select("*")
      .in("id", contactInspectionIds);

    inspectionsFromContacts = data || [];
  }

  const { data: inspectionsFromFieldsRaw } = await admin
    .from("inspections")
    .select("*")
    .or(
      [
        `realtor_email.ilike.${lookupEmail}`,
        `agent_email.ilike.${lookupEmail}`,
        `buyer_agent_email.ilike.${lookupEmail}`,
        `buyers_agent_email.ilike.${lookupEmail}`,
        `transaction_coordinator_email.ilike.${lookupEmail}`,
      ].join(",")
    );

  const inspections = uniqById([
    ...inspectionsFromContacts,
    ...(inspectionsFromFieldsRaw || []),
  ]).sort(
    (a: any, b: any) =>
      new Date(getInspectionDate(b) || 0).getTime() -
      new Date(getInspectionDate(a) || 0).getTime()
  );

  const inspectionIds = inspections.map((inspection: any) => cleanText(inspection.id));

  let repairShares: any[] = [];

  if (inspectionIds.length) {
    const { data } = await admin
      .from("repair_request_shares")
      .select("*")
      .in("inspection_id", inspectionIds)
      .order("created_at", { ascending: false });

    repairShares = data || [];
  }

  const repairShareIds = repairShares.map((share: any) => share.id).filter(Boolean);

  let repairResponses: any[] = [];

  if (repairShareIds.length) {
    const { data } = await admin
      .from("repair_request_responses")
      .select("*")
      .in("share_id", repairShareIds);

    repairResponses = data || [];
  }

  const responsesByShareId = repairResponses.reduce(
    (acc: Record<string, any[]>, response: any) => {
      const shareId = cleanText(response.share_id);
      if (!shareId) return acc;
      if (!acc[shareId]) acc[shareId] = [];
      acc[shareId].push(response);
      return acc;
    },
    {}
  );

  const sharesByInspectionId = repairShares.reduce(
    (acc: Record<string, any[]>, share: any) => {
      const inspectionId = cleanText(share.inspection_id);
      if (!inspectionId) return acc;
      if (!acc[inspectionId]) acc[inspectionId] = [];
      acc[inspectionId].push(share);
      return acc;
    },
    {}
  );

  const respondedShares = repairShares.filter((share) => getRepairStatus(share) === "responded");
  const waitingShares = repairShares.filter((share) => getRepairStatus(share) !== "responded");
  const totalRequestedCredit = repairShares.reduce((sum, share) => sum + getShareRequestedTotal(share), 0);
  const totalSellerCredit = repairShares.reduce((sum, share) => sum + getShareSellerTotal(share), 0);
  const totalDifference = totalSellerCredit - totalRequestedCredit;

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-10 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        {isOwnerPreview && (
          <div className="mb-6 rounded-2xl border border-purple-500/50 bg-purple-500/10 px-6 py-4">
            <p className="text-sm font-black uppercase tracking-wide text-purple-300">
              👁 Owner Preview Mode
            </p>
            <p className="mt-1 text-sm text-purple-100">
              Viewing the Realtor Portal as <strong>{lookupEmail}</strong> would see it. This is not
              your own account&apos;s data.
            </p>
          </div>
        )}

        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#14c8d2]">
                FLOW
              </p>

              <h1 className="mt-4 text-4xl font-black text-white md:text-5xl">
                Realtor Portal
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Reports, downloads, repair requests, seller responses, and addenda linked to your realtor account.
              </p>

              <p className="mt-3 break-words rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-200">
                {isOwnerPreview ? `Previewing as ${lookupEmail}` : `Logged in as ${userEmail}`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-[#020617] px-5 py-3 text-sm font-bold text-slate-300">
              Realtor Portal
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Linked Reports" value={String(inspections.length)} />
          <StatCard label="Repair Requests" value={String(repairShares.length)} />
          <StatCard label="Waiting" value={String(waitingShares.length)} />
          <StatCard label="Responded" value={String(respondedShares.length)} />
          <StatCard label="Buyer Requested" value={formatMoney(totalRequestedCredit)} />
          <StatCard label="Seller Offered" value={formatMoney(totalSellerCredit)} />
        </section>

        {repairShares.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 shadow-xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
                  Repair Request Credit Summary
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {formatMoney(totalDifference)} Difference
                </h2>
              </div>
              <p className={`w-fit rounded-full border px-4 py-2 text-sm font-black ${totalDifference < 0 ? "border-red-400/60 bg-red-500/15 text-red-200" : "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"}`}>
                {totalDifference < 0 ? "Seller offered less than requested" : "Seller met or exceeded requested credits"}
              </p>
            </div>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">My Linked Reports</h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            A report appears here when your account email matches the buyer&apos;s agent, realtor, transaction coordinator, or inspection contact email.
          </p>

          <div className="mt-6 space-y-4">
            {inspections.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-yellow-100">
                <p className="font-black">No linked reports found yet.</p>
                <p className="mt-2 text-sm leading-6">
                  Make sure the email on this account exactly matches the realtor email saved on the inspection contact.
                </p>
              </div>
            ) : (
              inspections.map((inspection: any) => {
                const id = cleanText(inspection.id);
                const address = getPropertyAddress(inspection);
                const shares = sharesByInspectionId[id] || [];
                const latestShare = shares[0] || null;
                const latestStatus = latestShare
                  ? getRepairStatus(latestShare)
                  : "";
                const propertyRequestedTotal = shares.reduce(
                  (sum: number, share: any) => sum + getShareRequestedTotal(share),
                  0
                );
                const propertySellerTotal = shares.reduce((sum: number, share: any) => {
                  const responses = responsesByShareId[cleanText(share.id)] || [];
                  return sum + (responses.length ? getResponseSellerTotal(responses) : getShareSellerTotal(share));
                }, 0);
                const propertyDifference = propertySellerTotal - propertyRequestedTotal;
                return (
                  <article
                    key={id}
                    className="rounded-2xl border border-slate-700 bg-[#020617] p-5 transition duration-150 hover:border-teal-500/60 hover:bg-[#071224] hover:shadow-[0_0_24px_rgba(20,184,166,0.12)] active:scale-[0.995]"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-black uppercase text-teal-200">
                            {getReportStatus(inspection)}
                          </span>

                          {latestShare ? (
                            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${getStatusBadge(latestStatus)}`}>
                              Latest: {getStatusLabel(latestStatus)}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-black uppercase text-slate-300">
                              No repair request sent yet
                            </span>
                          )}

                          {shares.length ? (
                            <span className="rounded-full border border-orange-500/50 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase text-orange-200">
                              {shares.length} Repair Request{shares.length === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-3 break-words text-2xl font-black text-white">
                          {address}
                        </h3>

                        <p className="mt-2 text-slate-300">{getClientName(inspection)}</p>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(getInspectionDate(inspection))}
                        </p>

                        {shares.length ? (
                          <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MiniMoneyCard label="Buyer Requested" value={formatMoney(propertyRequestedTotal)} />
                            <MiniMoneyCard label="Seller Offered" value={formatMoney(propertySellerTotal)} />
                            <MiniMoneyCard label="Difference" value={formatMoney(propertyDifference)} negative={propertyDifference < 0} />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[460px]">
                        <FastLinkButton
                          href={`/share/${id}?role=realtor&email=${encodeURIComponent(lookupEmail)}`}
                          loadingText="Opening Report..."
                          className="rounded-xl border border-teal-500 px-4 py-3 text-center font-black text-teal-300 hover:bg-teal-500/10"
                        >
                          View Report
                        </FastLinkButton>

                        <ReportDownloadLink
                          href={`/api/realtor-report-download/${encodeURIComponent(id)}?type=full`}
                          preparingText="Preparing Full Report..."
                          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-emerald-500 px-4 py-3 text-center font-black text-emerald-300 transition hover:bg-emerald-500/10 active:scale-[0.98]"
                        >
                          <>Full Report Download</>
                        </ReportDownloadLink>

                        <ReportDownloadLink
                          href={`/api/realtor-report-download/${encodeURIComponent(id)}?type=agent`}
                          preparingText="Preparing Agent Report..."
                          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-lime-500 px-4 py-3 text-center font-black text-lime-300 transition hover:bg-lime-500/10 active:scale-[0.98]"
                        >
                          <>Agent Report Download</>
                        </ReportDownloadLink>

                        <FastLinkButton
                          href={`/repair-request?inspection_id=${encodeURIComponent(id)}&role=realtor&email=${encodeURIComponent(lookupEmail)}`}
                          loadingText="Opening Builder..."
                          className="rounded-xl border border-cyan-500 px-4 py-3 text-center font-black text-cyan-300 hover:bg-cyan-500/10"
                        >
                          Build Repair Request
                        </FastLinkButton>
                      </div>
                    </div>

                    {shares.length ? (
                      <details className="group mt-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-200">
                                Repair Request History
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-300">
                                Previous repair requests are collapsed by default. Open this section to review saved requests, responses, addenda, and downloads.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-fit rounded-full border border-orange-400/60 bg-orange-500/15 px-3 py-1 text-xs font-black text-orange-100">
                                {shares.length} total
                              </span>
                              <span className="w-fit rounded-full border border-orange-400/60 bg-[#020617] px-3 py-1 text-xs font-black text-orange-100">
                                <span className="group-open:hidden">View History</span>
                                <span className="hidden group-open:inline">Hide History</span>
                              </span>
                            </div>
                          </div>
                        </summary>

                        <div className="mt-4 space-y-3 border-t border-orange-500/20 pt-4">
                          {shares.map((share: any, shareIndex: number) => {
                            const status = getRepairStatus(share);
                            const responses = responsesByShareId[cleanText(share.id)] || [];
                            const requested = getShareRequestedTotal(share);
                            const seller = responses.length
                              ? getResponseSellerTotal(responses)
                              : getShareSellerTotal(share);
                            const difference = seller - requested;
                            const selectedCount = getShareItemCount(share);
                            const requestNumber = getShareNumber(shareIndex, shares.length);

                            return (
                              <details
                                key={share.id || share.token}
                                className="group overflow-hidden rounded-2xl border border-slate-700 bg-[#020617] transition hover:border-orange-400/60"
                              >
                                <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 transition hover:bg-[#071224] sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="rounded-full border border-orange-400/60 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase text-orange-200">
                                        {requestNumber}
                                      </span>
                                      <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${getStatusBadge(status)}`}>
                                        {getStatusLabel(status)}
                                      </span>
                                      <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-black uppercase text-slate-300">
                                        {selectedCount} item{selectedCount === 1 ? "" : "s"}
                                      </span>
                                    </div>

                                    <p className="mt-2 break-words text-sm font-bold text-slate-300">
                                      Sent to: <span className="text-white">{share.recipient_email || "Recipient"}</span>
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                      Created {formatDate(share.created_at)}
                                      {share.responded_at ? ` • Responded ${formatDate(share.responded_at)}` : ""}
                                    </p>
                                  </div>

                                  <div className="grid gap-2 sm:min-w-[420px] sm:grid-cols-4">
                                    <MiniMoneyCard label="Requested" value={formatMoney(requested)} />
                                    <MiniMoneyCard label="Seller" value={responses.length ? formatMoney(seller) : "—"} />
                                    <MiniMoneyCard label="Difference" value={responses.length ? formatMoney(difference) : "—"} negative={difference < 0} />
                                    <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-3 text-center">
                                      <p className="text-[10px] font-black uppercase tracking-wide text-orange-200">Open</p>
                                      <p className="mt-1 text-lg font-black text-white transition group-open:rotate-180">⌄</p>
                                    </div>
                                  </div>
                                </summary>

                                <div className="border-t border-slate-800 p-4">
                                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4">
                                      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-200">
                                        Linked Addendum + Seller Response
                                      </p>
                                      <p className="mt-2 break-words text-sm font-bold text-slate-300">
                                        Created by: <span className="text-white">{getRepairRequestCreatorLabel(share)}</span>
                                      </p>
                                      <p className="mt-1 break-words text-sm font-bold text-slate-300">
                                        Report: <span className="text-white">{address}</span>
                                      </p>
                                      <p className="mt-1 text-xs font-bold text-slate-500">
                                        This repair request, response, addendum, and downloads are linked to report #{id}.
                                      </p>

                                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                                        <MiniMoneyCard label="Items" value={String(selectedCount)} />
                                        <MiniMoneyCard label="Requested" value={formatMoney(requested)} />
                                        <MiniMoneyCard label="Seller" value={responses.length ? formatMoney(seller) : "—"} />
                                        <MiniMoneyCard label="Difference" value={responses.length ? formatMoney(difference) : "—"} negative={difference < 0} />
                                      </div>
                                    </div>

                                    <RepairTimeline
                                      status={status}
                                      createdAt={share.created_at}
                                      viewedAt={share.viewed_at || share.opened_at || share.last_viewed_at}
                                      respondedAt={share.responded_at}
                                      responses={responses}
                                    />
                                  </div>

                                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <FastLinkButton
                                      href={`/repair-request?inspection_id=${encodeURIComponent(id)}&role=realtor&email=${encodeURIComponent(lookupEmail)}&selected=${encodeURIComponent(Array.isArray(share.selected_finding_ids) ? share.selected_finding_ids.join(",") : "")}&share=${encodeURIComponent(String(share.id || ""))}`}
                                      loadingText="Opening Request..."
                                      className="rounded-xl border border-cyan-500 px-4 py-3 text-center text-sm font-black text-cyan-300 hover:bg-cyan-500/10"
                                    >
                                      Open Request
                                    </FastLinkButton>

                                    <FastLinkButton
                                      href={`/repair-response/${share.token}`}
                                      loadingText="Opening Response..."
                                      className="rounded-xl border border-purple-500 px-4 py-3 text-center text-sm font-black text-purple-300 hover:bg-purple-500/10"
                                    >
                                      Open Response
                                    </FastLinkButton>

                                    <a
                                      href={`/api/repair-request-addendum/${encodeURIComponent(share.token)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-purple-400 px-4 py-3 text-center text-sm font-black text-purple-200 transition hover:bg-purple-500/10 active:scale-[0.98]"
                                    >
                                      {status === "responded" ? "View Addendum" : "Preview Addendum"}
                                    </a>

                                    <a
                                      href={`/api/repair-request-addendum/${encodeURIComponent(share.token)}?download=1`}
                                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-orange-400 px-4 py-3 text-center text-sm font-black text-orange-200 transition hover:bg-orange-500/10 active:scale-[0.98]"
                                    >
                                      Download Addendum
                                    </a>

                                    <div className="sm:col-span-2 lg:col-span-4">
                                      <EmailAddendumButton
                                        token={share.token}
                                        ready={status === "responded"}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function RepairTimeline({
  status,
  createdAt,
  viewedAt,
  respondedAt,
  responses,
}: {
  status: string;
  createdAt: any;
  viewedAt?: any;
  respondedAt?: any;
  responses: any[];
}) {
  const responseDate = respondedAt || responses?.[0]?.created_at || responses?.[0]?.submitted_at;
  const steps = [
    { label: "Created", value: createdAt, done: Boolean(createdAt) },
    { label: "Viewed", value: viewedAt, done: Boolean(viewedAt) || status === "viewed" || status === "responded" },
    { label: "Seller Response", value: responseDate, done: Boolean(responseDate) || status === "responded" },
    { label: "Addendum", value: responseDate, done: status === "responded" },
  ];

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Timeline</p>
      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-start gap-3">
            <span
              className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                step.done ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <div>
              <p className={`text-sm font-black ${step.done ? "text-white" : "text-slate-500"}`}>
                {step.label}
              </p>
              <p className="text-xs font-bold text-slate-500">
                {step.value ? formatDate(step.value) : step.done ? "Completed" : "Waiting"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6 shadow-xl transition duration-150 hover:border-teal-400 hover:bg-teal-500/10 active:scale-[0.985]">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 break-words text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniMoneyCard({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${negative ? "text-red-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
