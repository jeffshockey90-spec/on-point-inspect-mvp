import FastLinkButton from "../../components/FastLinkButton";
import EmailAddendumButton from "../../components/EmailAddendumButton";
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

  return date.toLocaleDateString("en-US", {
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

export default async function RealtorPortalPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = cleanEmail(user.email);

  if (!userEmail) {
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
    .ilike("email", userEmail);

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
        `realtor_email.ilike.${userEmail}`,
        `agent_email.ilike.${userEmail}`,
        `buyer_agent_email.ilike.${userEmail}`,
        `buyers_agent_email.ilike.${userEmail}`,
        `transaction_coordinator_email.ilike.${userEmail}`,
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
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                On Point Inspect
              </p>

              <h1 className="mt-4 text-4xl font-black text-white md:text-5xl">
                Realtor Portal
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Reports, downloads, repair requests, seller responses, and addenda linked to your realtor account.
              </p>

              <p className="mt-3 break-words rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-200">
                Logged in as {userEmail}
              </p>
            </div>

            <FastLinkButton
              href="/"
              loadingText="Opening..."
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back
            </FastLinkButton>
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
                const latestStatus = latestShare ? getRepairStatus(latestShare) : "";
                const requestedTotal = latestShare ? getShareRequestedTotal(latestShare) : 0;
                const sellerTotal = latestShare ? getShareSellerTotal(latestShare) : 0;
                const difference = sellerTotal - requestedTotal;

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
                              Repair Request: {getStatusLabel(latestStatus)}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-black uppercase text-slate-300">
                              No repair request sent yet
                            </span>
                          )}
                        </div>

                        <h3 className="mt-3 break-words text-2xl font-black text-white">
                          {address}
                        </h3>

                        <p className="mt-2 text-slate-300">{getClientName(inspection)}</p>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(getInspectionDate(inspection))}
                        </p>

                        {latestShare ? (
                          <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MiniMoneyCard label="Buyer Requested" value={formatMoney(requestedTotal)} />
                            <MiniMoneyCard label="Seller Offered" value={formatMoney(sellerTotal)} />
                            <MiniMoneyCard label="Difference" value={formatMoney(difference)} negative={difference < 0} />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[460px]">
                        <FastLinkButton
                          href={`/share/${id}?role=realtor&email=${encodeURIComponent(userEmail)}`}
                          loadingText="Opening Report..."
                          className="rounded-xl border border-teal-500 px-4 py-3 text-center font-black text-teal-300 hover:bg-teal-500/10"
                        >
                          View Report
                        </FastLinkButton>

                        <a
                          href={`/api/realtor-report-download/${encodeURIComponent(id)}?type=full`}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-emerald-500 px-4 py-3 text-center font-black text-emerald-300 transition hover:bg-emerald-500/10 active:scale-[0.98]"
                        >
                          Full Report Download
                        </a>

                        <a
                          href={`/api/realtor-report-download/${encodeURIComponent(id)}?type=agent`}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-lime-500 px-4 py-3 text-center font-black text-lime-300 transition hover:bg-lime-500/10 active:scale-[0.98]"
                        >
                          Agent Report Download
                        </a>

                        <FastLinkButton
                          href={`/repair-request?inspection_id=${encodeURIComponent(id)}&role=realtor&email=${encodeURIComponent(userEmail)}`}
                          loadingText="Opening Builder..."
                          className="rounded-xl border border-cyan-500 px-4 py-3 text-center font-black text-cyan-300 hover:bg-cyan-500/10"
                        >
                          Build Repair Request
                        </FastLinkButton>

                        {latestShare ? (
                          <FastLinkButton
                            href={`/repair-response/${latestShare.token}`}
                            loadingText="Opening Response..."
                            className="rounded-xl border border-purple-500 px-4 py-3 text-center font-black text-purple-300 hover:bg-purple-500/10"
                          >
                            Open Response
                          </FastLinkButton>
                        ) : null}

                        {latestShare ? (
                          <>
                            <a
                              href={`/api/repair-request-addendum/${encodeURIComponent(latestShare.token)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-purple-400 px-4 py-3 text-center font-black text-purple-200 transition hover:bg-purple-500/10 active:scale-[0.98]"
                            >
                              {latestStatus === "responded" ? "View Addendum" : "Preview Addendum"}
                            </a>

                            <a
                              href={`/api/repair-request-addendum/${encodeURIComponent(latestShare.token)}?download=1`}
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-orange-400 px-4 py-3 text-center font-black text-orange-200 transition hover:bg-orange-500/10 active:scale-[0.98]"
                            >
                              {latestStatus === "responded" ? "Download Addendum" : "Download Draft Addendum"}
                            </a>

                            <EmailAddendumButton
                              token={latestShare.token}
                              ready={latestStatus === "responded"}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
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
