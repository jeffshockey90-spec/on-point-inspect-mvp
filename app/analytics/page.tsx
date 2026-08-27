
import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import { resolveInspectionAccessFilter, resolveTeamInspectorIds } from "../../lib/inspectionAccess";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function getInspectionPrice(inspection: any) {
  return (
    getNumber(inspection?.price) ||
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    calculatePriceFromSqft(inspection?.square_feet || inspection?.sqft) ||
    0
  );
}

function getPaidAmount(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getBalanceDue(inspection: any) {
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    return getNumber(inspection.balance_due);
  }

  return Math.max(0, getInspectionPrice(inspection) - getPaidAmount(inspection));
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function isSameMonth(dateValue: any, now = new Date()) {
  if (!dateValue) return false;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function getDateValue(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);
  const balance = getBalanceDue(inspection);

  if (price > 0 && paid >= price) return true;
  if (paid > 0 && balance <= 0) return true;

  return false;
}

function isAgreementSigned(inspection: any) {
  const status = String(
    inspection?.agreement_status || inspection?.agreement_state || ""
  ).toLowerCase();

  return (
    status === "signed" ||
    status === "complete" ||
    status === "completed" ||
    status === "accepted" ||
    inspection?.agreement_signed === true ||
    inspection?.signed_agreement === true
  );
}

function isReportPublished(inspection: any) {
  const reportStatus = String(inspection?.report_status || "").toLowerCase();
  const status = String(inspection?.status || "").toLowerCase();

  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    inspection?.report_published === true ||
    reportStatus === "published" ||
    reportStatus === "ready" ||
    status === "published" ||
    status === "ready"
  );
}

function getMonthKey(dateValue: any) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "No Date";

  return formatAppValue(date, {
    year: "numeric",
    month: "short",
  });
}

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getServiceType(inspection: any) {
  const raw = String(
    inspection?.inspection_type ||
      inspection?.service_type ||
      inspection?.type ||
      ""
  ).toLowerCase();

  const hasRadon =
    raw.includes("radon") ||
    inspection?.radon === true ||
    inspection?.radon_test === true ||
    inspection?.radon_testing === true;

  const hasMold =
    raw.includes("mold") ||
    inspection?.mold === true ||
    inspection?.mold_test === true ||
    inspection?.mold_testing === true;

  if (hasRadon && hasMold) return "Home + Radon + Mold";
  if (hasRadon) return "Home + Radon";
  if (hasMold) return "Home + Mold";
  if (raw.includes("maintenance")) return "Maintenance";
  if (raw.includes("seller") || raw.includes("pre-list")) return "Seller";
  if (raw.includes("new construction")) return "New Construction";
  if (raw.includes("radon")) return "Radon";
  if (raw.includes("mold")) return "Mold";

  return inspection?.inspection_type || "Home Inspection";
}

function getRevenueValue(inspection: any) {
  if (isPaymentComplete(inspection)) {
    return getPaidAmount(inspection) || getInspectionPrice(inspection);
  }

  return 0;
}

function getDaysOutstanding(inspection: any) {
  const dateValue =
    inspection?.invoice_due_date ||
    inspection?.inspection_date ||
    inspection?.created_at;

  if (!dateValue) return 0;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 0;

  const diff = Date.now() - date.getTime();

  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}


function getPercent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function getDurationSeconds(log: any) {
  const seconds = Number(log?.metadata?.duration_seconds || 0);
  return Number.isFinite(seconds) ? seconds : 0;
}

function formatDuration(secondsValue: number) {
  const seconds = Math.max(0, Math.round(secondsValue || 0));

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function hasRadonService(inspection: any) {
  const raw = String(
    inspection?.inspection_type ||
      inspection?.service_type ||
      inspection?.type ||
      inspection?.service_mode ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return (
    raw.includes("radon") ||
    inspection?.radon === true ||
    inspection?.radon_test === true ||
    inspection?.radon_testing === true
  );
}

function hasMoldService(inspection: any) {
  const raw = String(
    inspection?.inspection_type ||
      inspection?.service_type ||
      inspection?.type ||
      inspection?.service_mode ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return (
    raw.includes("mold") ||
    inspection?.mold === true ||
    inspection?.mold_test === true ||
    inspection?.mold_testing === true
  );
}

function getViewType(log: any) {
  return String(log?.view_type || "").toLowerCase();
}

function getInspectionIdFromViewLog(log: any) {
  return String(log?.inspection_id_bigint || log?.inspection_id || "");
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .eq(accessFilter.column, accessFilter.value)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-8 text-[var(--fl-text)]">
        <h1 className="text-3xl font-bold text-red-400">
          Error loading analytics
        </h1>
        <p className="mt-4 text-[var(--fl-muted)]">{error.message}</p>
      </main>
    );
  }

  const rows = inspections || [];
  const now = new Date();

  const inspectionIds = rows.map((inspection: any) => Number(inspection.id)).filter(Boolean);

  // Kick off every independent read for this page at once. The heavy revenue /
  // status aggregation below only needs `rows`, so these run while that computes,
  // and the page waits for the slowest branch instead of ~5 serial round-trips.
  const emptyRes = { data: [] as any[], error: null } as any;
  const [viewEventsResult, ownCompany, emailLogRows, secure24Bundle] = await Promise.all([
    inspectionIds.length > 0
      ? supabase
          .from("inspection_view_events")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
      : Promise.resolve(emptyRes),
    // Inspector's own company (for their Google review count) — a two-step chain.
    (async () => {
      const { data: companyUser } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!companyUser?.company_id) return null;
      const { data } = await supabase
        .from("companies")
        .select("name, google_review_count, google_rating")
        .eq("id", companyUser.company_id)
        .maybeSingle();
      return data;
    })(),
    // Report / review-request emails sent through FLOW for these inspections.
    inspectionIds.length > 0
      ? supabase
          .from("email_logs")
          .select("inspection_id_bigint, email_type")
          .in("email_type", ["inspection_report", "environmental_report", "review_request"])
          .in("inspection_id_bigint", inspectionIds)
          .then((r: any) => (r.data || []) as any[])
      : Promise.resolve([] as any[]),
    // Secure 24 referral leads for this inspector / team. teamIds + settings need
    // only user.id; the leads need teamIds, so that one waits inside this branch.
    (async () => {
      const teamInspectorIds = await resolveTeamInspectorIds(supabase, user.id);
      const [settingRes, leadRes] = await Promise.all([
        supabase.from("secure24_settings").select("enabled").eq("user_id", user.id).maybeSingle(),
        teamInspectorIds.length > 0
          ? supabase
              .from("secure24_leads")
              .select("status, consent_at, created_at")
              .in("inspector_id", teamInspectorIds)
          : Promise.resolve(emptyRes),
      ]);
      return { s24SettingRow: settingRes.data, s24LeadRows: leadRes.data };
    })(),
  ]);

  if (viewEventsResult.error) {
    console.error("Analytics view events load error:", viewEventsResult.error);
  }

  const viewEvents = viewEventsResult.data || [];

  const inspectionsThisMonth = rows.filter((inspection: any) =>
    isSameMonth(getDateValue(inspection), now)
  );

  const paidRows = rows.filter(isPaymentComplete);
  const paidThisMonth = inspectionsThisMonth.filter(isPaymentComplete);

  const revenueAllTime = paidRows.reduce(
    (sum: number, inspection: any) =>
      sum + (getPaidAmount(inspection) || getInspectionPrice(inspection)),
    0
  );

  const revenueThisMonth = paidThisMonth.reduce(
    (sum: number, inspection: any) =>
      sum + (getPaidAmount(inspection) || getInspectionPrice(inspection)),
    0
  );

  const quotedAllTime = rows.reduce(
    (sum: number, inspection: any) => sum + getInspectionPrice(inspection),
    0
  );

  const outstandingBalance = rows.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  const averageInspectionFee =
    rows.length > 0 ? quotedAllTime / rows.length : 0;

  const paymentsPending = rows.filter(
    (inspection: any) => !isPaymentComplete(inspection) && getBalanceDue(inspection) > 0
  );

  const agreementsPending = rows.filter((inspection: any) => !isAgreementSigned(inspection));

  const reportsPendingPublish = rows.filter(
    (inspection: any) => !isReportPublished(inspection)
  );

  const readyToDeliver = rows.filter(
    (inspection: any) =>
      isAgreementSigned(inspection) &&
      isPaymentComplete(inspection) &&
      isReportPublished(inspection)
  );

  const totalInspections = rows.length;
  const signedAgreementCount = rows.filter(isAgreementSigned).length;
  const paidInspectionCount = rows.filter(isPaymentComplete).length;
  const publishedReportCount = rows.filter(isReportPublished).length;

  const revenueAtRisk = paymentsPending.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  // "Requested" is computed below from actual review_request emails sent through
  // FLOW (see the per-inspector block), not a heuristic inspection field.

  // --- Per-inspector additions (every query below is scoped to THIS user's
  // own inspections / company, so nothing leaks across companies) ---

  // ownCompany (for the Google review count) is resolved in the Promise.all above.
  const googleReviewCount = getNumber(ownCompany?.google_review_count);
  const googleRating = ownCompany?.google_rating ? Number(ownCompany.google_rating) : null;

  // emailLogRows (report deliveries + review requests sent through FLOW) is
  // resolved in the Promise.all above.
  const reportEmailInspectionIds = new Set(
    (emailLogRows || [])
      .filter((e: any) =>
        e.email_type === "inspection_report" || e.email_type === "environmental_report"
      )
      .map((e: any) => String(e.inspection_id_bigint))
  );
  const reviewRequestInspectionIds = new Set(
    (emailLogRows || [])
      .filter((e: any) => e.email_type === "review_request")
      .map((e: any) => String(e.inspection_id_bigint))
  );
  const reportsSentCount = rows.filter((r: any) =>
    reportEmailInspectionIds.has(String(r.id))
  ).length;
  // Real review requests: inspections we actually emailed a review request for.
  const reviewRequestedCount = rows.filter((r: any) =>
    reviewRequestInspectionIds.has(String(r.id))
  ).length;
  const reviewRequestRate = getPercent(reviewRequestedCount, rows.length);

  // Turnaround: average days from the inspection date to publish, and to paid.
  const daysBetween = (from: any, to: any): number | null => {
    const t1 = new Date(from).getTime();
    const t2 = new Date(to).getTime();
    if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) return null;
    return (t2 - t1) / 86_400_000;
  };
  const avgOf = (arr: number[]) =>
    arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const avgDaysToPublish = avgOf(
    rows
      .map((r: any) => daysBetween(r.inspection_date, r.published_at))
      .filter((d: any): d is number => d != null)
  );
  const avgDaysToPaid = avgOf(
    rows
      .map((r: any) => daysBetween(r.inspection_date, r.paid_at))
      .filter((d: any): d is number => d != null)
  );

  // Secure 24 referral leads / settings for THIS inspector (or the owner's team)
  // are resolved in the Promise.all above. RLS on secure24_leads only returns
  // rows the caller owns, so this stays isolated even with the team id list.
  const { s24SettingRow, s24LeadRows } = secure24Bundle;
  const secure24Enabled = s24SettingRow?.enabled === true;
  const secure24Sent = (s24LeadRows || []).filter((l: any) => l.status === "submitted");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const secure24ThisMonth = secure24Sent.filter((l: any) => {
    const t = new Date(l.consent_at || l.created_at || 0).getTime();
    return Number.isFinite(t) && t >= monthStart;
  }).length;
  const showSecure24 = secure24Enabled || secure24Sent.length > 0;

  // Outstanding payment aging: how old the unpaid balances are.
  const aging = {
    b0: { count: 0, amount: 0 }, // 0-30 days
    b1: { count: 0, amount: 0 }, // 31-60 days
    b2: { count: 0, amount: 0 }, // 60+ days
  };
  for (const inspection of paymentsPending) {
    const age = daysBetween(getDateValue(inspection), now.toISOString());
    if (age == null) continue;
    const bucket = age <= 30 ? aging.b0 : age <= 60 ? aging.b1 : aging.b2;
    bucket.count += 1;
    bucket.amount += getBalanceDue(inspection);
  }

  const emailOpenEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "email_open"
  );
  const emailClickEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "email_click"
  );
  const agreementViewedEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "agreement_viewed"
  );
  const agreementSignedEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "agreement_signed"
  );
  const repairRequestEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "repair_request"
  );
  const reportOpenEvents = viewEvents.filter((log: any) =>
    ["report_share", "environmental_share", "client_portal"].includes(
      getViewType(log)
    )
  );

  // Deduped "real" opens: collapse reloads by the same viewer within 30 minutes
  // on the same report, so refresh spam doesn't inflate the number (matches the
  // owner dashboard's session count).
  const reportOpenSessions = (() => {
    const byViewer = new Map<string, number[]>();
    for (const log of reportOpenEvents) {
      const insp = String(log.inspection_id_bigint || log.inspection_id || "");
      const viewer = String(
        log.viewer_email || log.ip_hash || log.ip_address || "anon"
      ).toLowerCase();
      const t = new Date(log.created_at || 0).getTime();
      if (!Number.isFinite(t)) continue;
      const key = `${insp}|${viewer}`;
      const list = byViewer.get(key) || [];
      list.push(t);
      byViewer.set(key, list);
    }
    let sessions = 0;
    for (const times of byViewer.values()) {
      times.sort((a, b) => a - b);
      let last = -Infinity;
      for (const t of times) {
        if (t - last > 30 * 60 * 1000) sessions += 1;
        last = t;
      }
    }
    return sessions;
  })();
  const reportTimeEvents = viewEvents.filter(
    (log: any) =>
      getViewType(log) === "report_time_final" ||
      getViewType(log) === "report_time_checkpoint"
  );
  const reportTimeFinalEvents = viewEvents.filter(
    (log: any) => getViewType(log) === "report_time_final"
  );

  const totalReadingSeconds = reportTimeFinalEvents.reduce(
    (sum: number, log: any) => sum + getDurationSeconds(log),
    0
  );
  const averageReadingSeconds =
    reportTimeFinalEvents.length > 0
      ? totalReadingSeconds / reportTimeFinalEvents.length
      : 0;

  const reportViewMap: Record<string, { count: number; seconds: number }> = {};

  reportOpenEvents.forEach((log: any) => {
    const key = getInspectionIdFromViewLog(log);
    if (!key) return;
    if (!reportViewMap[key]) reportViewMap[key] = { count: 0, seconds: 0 };
    reportViewMap[key].count += 1;
  });

  reportTimeFinalEvents.forEach((log: any) => {
    const key = getInspectionIdFromViewLog(log);
    if (!key) return;
    if (!reportViewMap[key]) reportViewMap[key] = { count: 0, seconds: 0 };
    reportViewMap[key].seconds += getDurationSeconds(log);
  });

  const mostViewedReport = Object.entries(reportViewMap)
    .map(([inspectionId, values]) => {
      const inspection = rows.find(
        (row: any) => String(row.id) === String(inspectionId)
      );

      return {
        inspectionId,
        inspection,
        ...values,
      };
    })
    .sort((a, b) => b.count - a.count || b.seconds - a.seconds)[0];

  const radonRows = rows.filter(hasRadonService);
  const moldRows = rows.filter(hasMoldService);
  const radonAttachmentRate = getPercent(radonRows.length, rows.length);
  const moldAttachmentRate = getPercent(moldRows.length, rows.length);
  const radonRevenue = radonRows.reduce(
    (sum: number, inspection: any) => sum + getRevenueValue(inspection),
    0
  );
  const moldRevenue = moldRows.reduce(
    (sum: number, inspection: any) => sum + getRevenueValue(inspection),
    0
  );

  const monthMap: Record<string, { revenue: number; count: number }> = {};

  rows.forEach((inspection: any) => {
    const key = getMonthKey(getDateValue(inspection));
    if (!monthMap[key]) monthMap[key] = { revenue: 0, count: 0 };

    monthMap[key].count += 1;

    if (isPaymentComplete(inspection)) {
      monthMap[key].revenue +=
        getPaidAmount(inspection) || getInspectionPrice(inspection);
    }
  });

  const monthlyRows = Object.entries(monthMap)
    .filter(([month]) => month !== "No Date")
    .map(([month, values]) => ({
      month,
      ...values,
    }))
    .reverse()
    .slice(-6);

  const maxMonthlyRevenue = Math.max(
    1,
    ...monthlyRows.map((row) => row.revenue)
  );

  const realtorMap: Record<
    string,
    { name: string; email: string; count: number; revenue: number }
  > = {};

  rows.forEach((inspection: any) => {
    const displayName =
      inspection?.realtor_name ||
      inspection?.agent_name ||
      inspection?.realtor_email ||
      "No Realtor Listed";

    const displayEmail =
      inspection?.realtor_email ||
      inspection?.agent_email ||
      "";

    const key = inspection?.realtor_contact_id
      ? `contact:${inspection.realtor_contact_id}`
      : `legacy:${String(displayEmail || displayName).trim().toLowerCase()}`;

    if (!realtorMap[key]) {
      realtorMap[key] = {
        name: displayName,
        email: displayEmail,
        count: 0,
        revenue: 0,
      };
    }

    realtorMap[key].count += 1;

    if (isPaymentComplete(inspection)) {
      realtorMap[key].revenue +=
        getPaidAmount(inspection) || getInspectionPrice(inspection);
    }
  });

  const realtorRows = Object.entries(realtorMap).map(([key, values]) => ({
    key,
    ...values,
  }));

  const linkedReferralCount = rows.filter(
    (inspection: any) => !!inspection?.realtor_contact_id
  ).length;

  const referralCount = rows.filter(
    (inspection: any) =>
      !!inspection?.realtor_contact_id ||
      !!inspection?.realtor_name ||
      !!inspection?.agent_name ||
      !!inspection?.realtor_email
  ).length;

  const referralRevenue = rows.reduce((sum: number, inspection: any) => {
    const hasReferral =
      !!inspection?.realtor_contact_id ||
      !!inspection?.realtor_name ||
      !!inspection?.agent_name ||
      !!inspection?.realtor_email;

    return hasReferral ? sum + getRevenueValue(inspection) : sum;
  }, 0);

  const topRealtors = realtorRows
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 8);

  const topRealtorsByRevenue = [...realtorRows]
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 8);

  const serviceTypeMap: Record<
    string,
    { count: number; revenue: number; quoted: number }
  > = {};

  rows.forEach((inspection: any) => {
    const type = getServiceType(inspection);

    if (!serviceTypeMap[type]) {
      serviceTypeMap[type] = { count: 0, revenue: 0, quoted: 0 };
    }

    serviceTypeMap[type].count += 1;
    serviceTypeMap[type].quoted += getInspectionPrice(inspection);
    serviceTypeMap[type].revenue += getRevenueValue(inspection);
  });

  const serviceTypeRows = Object.entries(serviceTypeMap)
    .map(([type, values]) => ({
      type,
      ...values,
      percentage: rows.length > 0 ? Math.round((values.count / rows.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  const maxServiceCount = Math.max(
    1,
    ...serviceTypeRows.map((row) => row.count)
  );

  const maxServiceRevenue = Math.max(
    1,
    ...serviceTypeRows.map((row) => row.revenue)
  );

  const averageMonthlyRevenue =
    monthlyRows.length > 0
      ? monthlyRows.reduce((sum, row) => sum + row.revenue, 0) /
        monthlyRows.length
      : 0;

  const outstandingInvoices = rows
    .map((inspection: any) => ({
      ...inspection,
      invoiceAmount: getInspectionPrice(inspection),
      amountPaid: getPaidAmount(inspection),
      balanceDue: getBalanceDue(inspection),
      daysOutstanding: getDaysOutstanding(inspection),
    }))
    .filter((inspection: any) => !isPaymentComplete(inspection) && inspection.balanceDue > 0)
    .sort((a: any, b: any) => b.balanceDue - a.balanceDue)
    .slice(0, 10);

  const recentInspections = rows.slice(0, 8);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#14c8d2]">
                FLOW
              </p>

              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">
                Analytics Dashboard
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Track revenue, inspections, payments, agreements, publishing, and realtor referrals.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Revenue This Month"
            value={money(revenueThisMonth)}
            helper={`${paidThisMonth.length} paid inspection${paidThisMonth.length === 1 ? "" : "s"}`}
            tone="green"
          />

          <MetricCard
            label="Revenue All Time"
            value={money(revenueAllTime)}
            helper={`${paidRows.length} paid inspection${paidRows.length === 1 ? "" : "s"}`}
            tone="teal"
          />

          <MetricCard
            label="Inspections This Month"
            value={String(inspectionsThisMonth.length)}
            helper={`${rows.length} total inspection${rows.length === 1 ? "" : "s"}`}
            tone="blue"
          />

          <MetricCard
            label="Realtor Referrals"
            value={String(referralCount)}
            helper={`${linkedReferralCount} linked to saved realtor contacts`}
            tone="teal"
          />

          <MetricCard
            label="Referral Revenue"
            value={money(referralRevenue)}
            helper="Paid revenue tied to realtor referrals."
            tone="green"
          />

          <MetricCard
            label="Average Inspection Fee"
            value={money(averageInspectionFee)}
            helper="Uses saved price; falls back to sq ft pricing."
            tone="purple"
          />

          <MetricCard
            label="Avg Monthly Revenue"
            value={money(averageMonthlyRevenue)}
            helper="Based on displayed monthly revenue data."
            tone="teal"
          />

          <MetricCard
            label="Payments Pending"
            value={String(paymentsPending.length)}
            helper={`${money(outstandingBalance)} outstanding`}
            tone="orange"
          />

          <MetricCard
            label="Revenue At Risk"
            value={money(revenueAtRisk)}
            helper="Unpaid balances needing follow-up."
            tone="red"
          />

          <MetricCard
            label="Agreements Pending"
            value={String(agreementsPending.length)}
            helper="Inspections missing signed agreement."
            tone="yellow"
          />

          <MetricCard
            label="Reports Pending Publish"
            value={String(reportsPendingPublish.length)}
            helper="Draft or unpublished reports."
            tone="red"
          />

          <MetricCard
            label="Ready / Delivered"
            value={String(readyToDeliver.length)}
            helper="Signed, paid, and published."
            tone="green"
          />

          <MetricCard
            label="Reports Sent"
            value={String(reportsSentCount)}
            helper="Emailed to clients."
            tone="blue"
          />

          <MetricCard
            label="Avg Days to Deliver"
            value={avgDaysToPublish != null ? avgDaysToPublish.toFixed(1) : "—"}
            helper="Inspection date to report published."
            tone="purple"
          />

          <MetricCard
            label="Avg Days to Get Paid"
            value={avgDaysToPaid != null ? avgDaysToPaid.toFixed(1) : "—"}
            helper="Inspection date to payment received."
            tone="green"
          />

          <MetricCard
            label="Google Reviews"
            value={String(googleReviewCount)}
            helper={
              googleRating
                ? `★ ${googleRating.toFixed(1)} average — grows as reviews come in.`
                : "Link your Google profile in settings to track this."
            }
            tone="yellow"
          />
        </section>

        <section className="mt-8">
          <Panel
            title="Outstanding Payment Aging"
            subtitle="How long your unpaid balances have been sitting — chase the oldest first."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniMetric
                label="0–30 days"
                value={money(aging.b0.amount)}
                helper={`${aging.b0.count} unpaid inspection${aging.b0.count === 1 ? "" : "s"}`}
              />
              <MiniMetric
                label="31–60 days"
                value={money(aging.b1.amount)}
                helper={`${aging.b1.count} unpaid inspection${aging.b1.count === 1 ? "" : "s"}`}
              />
              <MiniMetric
                label="60+ days"
                value={money(aging.b2.amount)}
                helper={`${aging.b2.count} unpaid inspection${aging.b2.count === 1 ? "" : "s"}`}
              />
            </div>
          </Panel>
        </section>

        {showSecure24 && (
          <section className="mt-8">
            <Panel
              title="Secure 24 Referrals"
              subtitle="Home-security leads your clients opted into. You earn a payout on installs."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <MiniMetric
                  label="Leads Sent"
                  value={String(secure24Sent.length)}
                  helper="Clients who opted in to a referral."
                />
                <MiniMetric
                  label="This Month"
                  value={String(secure24ThisMonth)}
                  helper="Referral leads sent this month."
                />
              </div>
              {!secure24Enabled && (
                <p className="mt-4 text-sm text-[var(--fl-muted)]">
                  Turn the referral on in Settings to offer it to your clients.
                </p>
              )}
            </Panel>
          </section>
        )}

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Conversion Funnel"
            subtitle="Shows where inspections stand from creation to delivery."
          >
            <div className="space-y-4">
              <FunnelStep
                label="Inspections Created"
                value={totalInspections}
                percent={100}
                helper="All inspections in your account."
              />
              <FunnelStep
                label="Agreements Signed"
                value={signedAgreementCount}
                percent={getPercent(signedAgreementCount, totalInspections)}
                helper={`${getPercent(signedAgreementCount, totalInspections)}% of inspections`}
              />
              <FunnelStep
                label="Payments Complete"
                value={paidInspectionCount}
                percent={getPercent(paidInspectionCount, totalInspections)}
                helper={`${money(revenueAtRisk)} still at risk`}
              />
              <FunnelStep
                label="Reports Published"
                value={publishedReportCount}
                percent={getPercent(publishedReportCount, totalInspections)}
                helper={`${reportsPendingPublish.length} report${reportsPendingPublish.length === 1 ? "" : "s"} pending publish`}
              />
              <FunnelStep
                label="Ready / Delivered"
                value={readyToDeliver.length}
                percent={getPercent(readyToDeliver.length, totalInspections)}
                helper="Signed, paid, and published."
              />
            </div>
          </Panel>

          <Panel
            title="Client Engagement"
            subtitle="Email opens, report clicks, portal/report views, and reading time."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniMetric
                label="Email Opens"
                value={String(emailOpenEvents.length)}
                helper="Tracked from report emails."
              />
              <MiniMetric
                label="Email Clicks"
                value={String(emailClickEvents.length)}
                helper="Report link clicks from email."
              />
              <MiniMetric
                label="Report / Portal Opens"
                value={String(reportOpenSessions)}
                helper="Real opens — rapid reloads merged."
              />
              <MiniMetric
                label="Avg Read Time"
                value={formatDuration(averageReadingSeconds)}
                helper={`${reportTimeFinalEvents.length} completed session${reportTimeFinalEvents.length === 1 ? "" : "s"}`}
              />
              <MiniMetric
                label="Agreement Views"
                value={String(agreementViewedEvents.length)}
                helper="Clients opened agreement pages."
              />
              <MiniMetric
                label="Agreements Signed"
                value={String(agreementSignedEvents.length)}
                helper="Completed agreement signatures."
              />
              <MiniMetric
                label="Repair Requests Viewed"
                value={String(repairRequestEvents.length)}
                helper="Clients opened repair requests."
              />
            </div>

            {mostViewedReport?.inspection && (
              <Link
                href={`/reports/${mostViewedReport.inspectionId}`}
                className="mt-5 block rounded-xl border border-purple-500/40 bg-purple-950/20 p-4 transition hover:bg-purple-500/10"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">
                  Most Viewed Report
                </p>
                <p className="mt-2 font-bold text-[var(--fl-text)]">
                  {mostViewedReport.inspection.property_address ||
                    mostViewedReport.inspection.address ||
                    "Untitled Inspection"}
                </p>
                <p className="mt-1 text-sm text-[var(--fl-muted)]">
                  {mostViewedReport.count} open{mostViewedReport.count === 1 ? "" : "s"} •{" "}
                  {formatDuration(mostViewedReport.seconds)} reading time
                </p>
              </Link>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Review Tracking"
            subtitle="Review requests you've sent through FLOW, and your live Google review count."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniMetric
                label="Requested"
                value={String(reviewRequestedCount)}
                helper={`${reviewRequestRate}% of inspections · sent via FLOW`}
              />
              <MiniMetric
                label="On Google"
                value={String(googleReviewCount)}
                helper={
                  googleRating
                    ? `★ ${googleRating.toFixed(1)} average rating`
                    : "Total reviews on your Google profile."
                }
              />
              <MiniMetric
                label="Not Requested"
                value={String(Math.max(0, rows.length - reviewRequestedCount))}
                helper="Opportunity for follow-up."
              />
            </div>
          </Panel>

          <Panel
            title="Environmental Add-On Analytics"
            subtitle="Radon and mold attachment rates and paid revenue."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniMetric
                label="Radon Sold"
                value={String(radonRows.length)}
                helper={`${radonAttachmentRate}% attachment rate`}
              />
              <MiniMetric
                label="Mold Sold"
                value={String(moldRows.length)}
                helper={`${moldAttachmentRate}% attachment rate`}
              />
              <MiniMetric
                label="Radon Revenue"
                value={money(radonRevenue)}
                helper="Paid revenue from inspections with radon."
              />
              <MiniMetric
                label="Mold Revenue"
                value={money(moldRevenue)}
                helper="Paid revenue from inspections with mold."
              />
            </div>
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel title="Monthly Revenue" subtitle="Paid revenue by inspection month.">
            {monthlyRows.length === 0 ? (
              <EmptyState text="No monthly revenue data yet." />
            ) : (
              <div className="space-y-4">
                {monthlyRows.map((row) => {
                  const width = Math.max(4, Math.round((row.revenue / maxMonthlyRevenue) * 100));

                  return (
                    <div key={row.month}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="font-bold text-[var(--fl-text)]">{row.month}</span>
                        <span className="text-[var(--fl-muted)]">{money(row.revenue)}</span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[var(--fl-ground)]">
                        <div
                          className="h-full rounded-full bg-teal-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Inspection Volume" subtitle="Inspection count by month.">
            {monthlyRows.length === 0 ? (
              <EmptyState text="No inspection volume data yet." />
            ) : (
              <div className="space-y-4">
                {monthlyRows.map((row) => {
                  const maxCount = Math.max(1, ...monthlyRows.map((item) => item.count));
                  const width = Math.max(4, Math.round((row.count / maxCount) * 100));

                  return (
                    <div key={row.month}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="font-bold text-[var(--fl-text)]">{row.month}</span>
                        <span className="text-[var(--fl-muted)]">
                          {row.count} inspection{row.count === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[var(--fl-ground)]">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel title="Top Referring Realtors" subtitle="Ranked by inspection count.">
            {topRealtors.length === 0 ? (
              <EmptyState text="No realtor referral data yet." />
            ) : (
              <div className="space-y-3">
                {topRealtors.map((realtor, index) => (
                  <div
                    key={realtor.key}
                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--fl-accent-text)]">
                          #{index + 1}
                        </p>

                        <p className="mt-1 text-lg font-bold text-[var(--fl-text)]">
                          {realtor.name}
                        </p>
                        {realtor.email && (
                          <p className="mt-1 text-xs text-[var(--fl-faint)]">
                            {realtor.email}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-[var(--fl-text)]">{realtor.count}</p>
                        <p className="text-xs text-[var(--fl-muted)]">inspections</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-[var(--fl-muted)]">
                      Paid Revenue: {money(realtor.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent Inspections" subtitle="Latest inspection activity.">
            {recentInspections.length === 0 ? (
              <EmptyState text="No inspections yet." />
            ) : (
              <div className="space-y-3">
                {recentInspections.map((inspection: any) => {
                  const paid = isPaymentComplete(inspection);
                  const signed = isAgreementSigned(inspection);
                  const published = isReportPublished(inspection);

                  return (
                    <Link
                      key={inspection.id}
                      href={`/reports/${inspection.id}`}
                      className="block rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 transition hover:border-teal-500/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-[var(--fl-text)]">
                            {inspection.property_address ||
                              inspection.address ||
                              "Untitled Inspection"}
                          </p>

                          <p className="mt-1 text-sm text-[var(--fl-muted)]">
                            {formatDate(getDateValue(inspection))} •{" "}
                            {inspection.client_name || "No client"}
                          </p>
                        </div>

                        <p className="font-semibold text-[var(--fl-accent-text)]">
                          {money(getInspectionPrice(inspection))}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <MiniBadge label={signed ? "Signed" : "Agreement"} complete={signed} />
                        <MiniBadge label={paid ? "Paid" : "Payment"} complete={paid} />
                        <MiniBadge label={published ? "Published" : "Draft"} complete={published} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Inspection Type Analytics"
            subtitle="Inspection count and percentage by service type."
          >
            {serviceTypeRows.length === 0 ? (
              <EmptyState text="No inspection type data yet." />
            ) : (
              <div className="space-y-4">
                {serviceTypeRows.map((row) => {
                  const width = Math.max(
                    4,
                    Math.round((row.count / maxServiceCount) * 100)
                  );

                  return (
                    <div
                      key={row.type}
                      className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-[var(--fl-text)]">{row.type}</span>
                        <span className="text-[var(--fl-muted)]">
                          {row.count} inspection{row.count === 1 ? "" : "s"} •{" "}
                          {row.percentage}%
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[var(--fl-ground)]">
                        <div
                          className="h-full rounded-full bg-blue-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>

                      <p className="mt-3 text-sm text-[var(--fl-muted)]">
                        Paid Revenue: {money(row.revenue)} • Quoted:{" "}
                        {money(row.quoted)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Revenue by Service Type"
            subtitle="Paid revenue grouped by inspection or add-on type."
          >
            {serviceTypeRows.length === 0 ? (
              <EmptyState text="No service revenue data yet." />
            ) : (
              <div className="space-y-4">
                {serviceTypeRows.map((row) => {
                  const width = Math.max(
                    4,
                    Math.round((row.revenue / maxServiceRevenue) * 100)
                  );

                  return (
                    <div key={row.type}>
                      <div className="mb-2 flex justify-between gap-3 text-sm">
                        <span className="font-bold text-[var(--fl-text)]">{row.type}</span>
                        <span className="text-[var(--fl-muted)]">
                          {money(row.revenue)}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[var(--fl-ground)]">
                        <div
                          className="h-full rounded-full bg-green-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Top Realtors by Revenue"
            subtitle="Ranked by paid revenue generated."
          >
            {topRealtorsByRevenue.length === 0 ? (
              <EmptyState text="No realtor revenue data yet." />
            ) : (
              <div className="space-y-3">
                {topRealtorsByRevenue.map((realtor, index) => (
                  <div
                    key={realtor.key}
                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--fl-accent-text)]">
                          #{index + 1}
                        </p>

                        <p className="mt-1 text-lg font-bold text-[var(--fl-text)]">
                          {realtor.name}
                        </p>
                        {realtor.email && (
                          <p className="mt-1 text-xs text-[var(--fl-faint)]">
                            {realtor.email}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-green-300">
                          {money(realtor.revenue)}
                        </p>
                        <p className="text-xs text-[var(--fl-muted)]">
                          {realtor.count} referral
                          {realtor.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Outstanding Invoice Leaderboard"
            subtitle="Highest unpaid balances requiring follow-up."
          >
            {outstandingInvoices.length === 0 ? (
              <EmptyState text="No outstanding invoices." />
            ) : (
              <div className="space-y-3">
                {outstandingInvoices.map((inspection: any) => (
                  <Link
                    key={inspection.id}
                    href={`/invoices/${inspection.id}/print`}
                    className="block rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 transition hover:border-orange-500/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-[var(--fl-text)]">
                          {inspection.property_address ||
                            inspection.address ||
                            "Untitled Inspection"}
                        </p>
                        <p className="mt-1 text-sm text-[var(--fl-muted)]">
                          {inspection.client_name || inspection.client || "No client"} •{" "}
                          {inspection.daysOutstanding} day
                          {inspection.daysOutstanding === 1 ? "" : "s"} outstanding
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-orange-300">
                          {money(inspection.balanceDue)}
                        </p>
                        <p className="text-xs text-[var(--fl-faint)]">
                          Invoice {money(inspection.invoiceAmount)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
            Pricing Logic Used
          </h2>

          <p className="mt-3 leading-7 text-[var(--fl-muted)]">
            Analytics uses the saved inspection price when available. If a price is missing, it estimates from square footage using your current pricing rule: <strong>$500 up to 2,000 sq ft</strong>, then <strong>+$50 per additional 1,000 sq ft or portion above 2,000 sq ft</strong>.
          </p>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "green" | "teal" | "blue" | "purple" | "orange" | "yellow" | "red";
}) {
  const colors: Record<string, string> = {
    green: "border-green-500/40 bg-green-950/20 text-green-300",
    teal: "border-teal-500/40 bg-teal-950/20 text-[var(--fl-accent-text)]",
    blue: "border-blue-500/40 bg-blue-950/20 text-blue-300",
    purple: "border-purple-500/40 bg-purple-950/20 text-purple-300",
    orange: "border-orange-500/40 bg-orange-950/20 text-orange-300",
    yellow: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300",
    red: "border-red-500/40 bg-red-950/20 text-red-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{value}</p>

      <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
      <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--fl-muted)]">{subtitle}</p>

      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
      {text}
    </div>
  );
}


function FunnelStep({
  label,
  value,
  percent,
  helper,
}: {
  label: string;
  value: number;
  percent: number;
  helper: string;
}) {
  const safePercent = Math.max(0, Math.min(100, percent || 0));

  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--fl-text)]">{label}</p>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">{helper}</p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold text-[var(--fl-accent-text)]">{value}</p>
          <p className="text-xs font-bold text-[var(--fl-faint)]">{safePercent}%</p>
        </div>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-[var(--fl-ground)]">
        <div
          className="h-full rounded-full bg-teal-400"
          style={{ width: `${Math.max(3, safePercent)}%` }}
        />
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">{value}</p>

      <p className="mt-2 text-sm leading-5 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

function MiniBadge({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        complete
          ? "border-green-500/40 bg-green-500/10 text-green-300"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
      }`}
    >
      {label}
    </span>
  );
}
