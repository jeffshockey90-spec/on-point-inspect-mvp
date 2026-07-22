
import { formatAppValue, currentLocalDate } from "../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cards = [
  { title: "Getting Started", description: "Set up your account, create sample data, and walk through your first inspection.", href: "/onboarding", icon: "🚀" },
  { title: "New Inspection", description: "Start a new inspection.", href: "/inspections/new", icon: "🏠" },
  { title: "Reports", description: "View and edit reports.", href: "/reports", icon: "📋" },
  { title: "Analytics", description: "Track revenue, inspections, payments, agreements, and reports.", href: "/analytics", icon: "📊" },
  { title: "Realtors", description: "Manage realtor contacts, referrals, and revenue.", href: "/realtors", icon: "🏡" },
  { title: "Referral Leaderboard", description: "Rank realtor referrals, revenue, paid inspections, and outstanding balances.", href: "/realtors/leaderboard", icon: "🏆" },
  { title: "Invoices", description: "Track paid, pending, overdue, and outstanding balances.", href: "/invoices", icon: "💰" },
  { title: "Agreements", description: "Manage agreement templates, sending, and signed status.", href: "/agreements", icon: "📝" },
  { title: "Client Portal", description: "Open client portals from reports after selecting an inspection.", href: "/reports", icon: "🔐" },
  { title: "Repair Requests", description: "Open repair requests from reports after selecting an inspection.", href: "/reports", icon: "🛠️" },
  { title: "Radon", description: "Manage radon tests, readings, devices, and results.", href: "/radon", icon: "☢️" },
  { title: "Mold", description: "Track mold samples, lab reports, results, and summaries.", href: "/mold", icon: "🧫" },
  { title: "AI Capture", description: "Create findings from photos.", href: "/ai-capture", icon: "🤖" },
  { title: "Equipment Analyzer", description: "Read data plates and document equipment inventory.", href: "/equipment-analyzer", icon: "🔎" },
  { title: "Field Tool", description: "Mobile AI inspection workflow.", href: "/field", icon: "📱" },
  { title: "Templates", description: "Manage favorite findings, templates, and reusable language.", href: "/templates", icon: "🧩" },
  { title: "Quotes", description: "Calculate pricing.", href: "/quotes", icon: "💲" },
  { title: "Schedule", description: "View inspection schedule.", href: "/schedule", icon: "🗓️" },
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

const OWNER_EMAILS = [
  "jeff@onpointhomeinspect.com",
  "jeffshockey90@gmail.com",
];

function cleanEmailForRouting(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function roleLooksLikeRealtorForRouting(value: unknown) {
  const role = String(value || "").trim().toLowerCase();

  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("transaction") ||
    role.includes("coordinator")
  );
}

function roleLooksLikeClientForRouting(value: unknown) {
  const role = String(value || "").trim().toLowerCase();

  return (
    role === "client" ||
    role.includes("buyer") ||
    role.includes("co-client") ||
    role.includes("coclient") ||
    role.includes("homeowner")
  );
}

async function getDashboardDestination(user: any) {
  const email = cleanEmailForRouting(user?.email);

  if (OWNER_EMAILS.includes(email)) return "/";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || !email) return "/login";

  const admin = createServiceClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const [{ data: inspectors }, { data: companies }, { data: contacts }] =
    await Promise.all([
      admin
        .from("inspectors")
        .select("id")
        .or(
          `user_id.eq.${user.id},email.ilike.${email},owner_email.ilike.${email}`,
        )
        .limit(1),
      admin
        .from("companies")
        .select("id")
        .or(
          `user_id.eq.${user.id},email.ilike.${email},owner_email.ilike.${email}`,
        )
        .limit(1),
      admin
        .from("inspection_contacts")
        .select("inspection_id,role,portal_access")
        .ilike("email", email)
        .limit(100),
    ]);

  if (inspectors?.length || companies?.length) return "/";

  const realtorContact = (contacts || []).some(
    (contact: any) =>
      contact?.portal_access !== false &&
      roleLooksLikeRealtorForRouting(contact?.role),
  );

  if (realtorContact) return "/realtor-portal";

  try {
    const { data: realtorInspection } = await admin
      .from("inspections")
      .select("id")
      .or(
        [
          `realtor_email.ilike.${email}`,
          `agent_email.ilike.${email}`,
          `buyer_agent_email.ilike.${email}`,
          `buyers_agent_email.ilike.${email}`,
          `transaction_coordinator_email.ilike.${email}`,
        ].join(","),
      )
      .limit(1);

    if (realtorInspection?.length) return "/realtor-portal";
  } catch {}

  const clientContact = (contacts || []).find(
    (contact: any) =>
      contact?.portal_access !== false &&
      roleLooksLikeClientForRouting(contact?.role) &&
      contact?.inspection_id,
  );

  if (clientContact?.inspection_id) {
    return `/client-portal/${encodeURIComponent(
      String(clientContact.inspection_id),
    )}`;
  }

  return "/login";
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(getNumber(value));
}

function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    0
  );
}

function getBalanceDue(inspection: any) {
  const storedBalance = inspection?.balance_due;

  if (storedBalance !== null && storedBalance !== undefined) {
    return Math.max(0, getNumber(storedBalance));
  }

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);

  return Math.max(0, invoiceAmount - amountPaid);
}

function isPaymentComplete(inspection: any) {
  const hasPaymentFields =
    inspection &&
    ("payment_status" in inspection ||
      "invoice_status" in inspection ||
      "invoice_amount" in inspection ||
      "amount_paid" in inspection ||
      "balance_due" in inspection ||
      "total_price" in inspection);

  if (!hasPaymentFields) return true;

  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);
  const balanceDue = getBalanceDue(inspection);

  if (status === "paid" || status === "waived") return true;
  if (status === "unpaid" || status === "partial") return false;
  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;
  if (invoiceAmount > 0 && balanceDue <= 0) return true;

  return true;
}

function formatActivityDate(value: any) {
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

function formatInspectionDate(value: any) {
  if (!value) return "No date set";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
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

  return formatActivityDate(value);
}

function getViewType(log: any) {
  return String(log?.view_type || "").toLowerCase();
}

function getViewerLabel(log: any) {
  const role = String(log?.viewer_role || "").trim().toLowerCase();
  const viewerEmail = String(log?.viewer_email || "").trim();

  if (viewerEmail) return viewerEmail;
  if (role === "client") return "Client";
  if (role === "realtor" || role === "agent") return "Realtor";
  if (role === "transaction coordinator") return "Transaction Coordinator";
  if (role === "inspector") return "Inspector";

  return "Inspector";
}

function getActivityIcon(log: any) {
  const type = getViewType(log);

  if (type === "client_portal") return "🔐";
  if (type === "report_share") return "📋";
  if (type === "environmental_share") return "🧪";
  if (type === "email_open") return "📬";
  if (type === "email_click") return "👆";
  if (type === "agreement_page") return "📝";
  if (type === "agreement_signed") return "✅";
  if (type === "payment_received") return "💰";
  if (type === "repair_request") return "🛠️";
  if (type === "report_time_final" || type === "report_time_checkpoint") return "⏱️";

  return "🔔";
}

function getActivityTitle(log: any) {
  const type = getViewType(log);
  const viewer = getViewerLabel(log);

  if (type === "client_portal") return `${viewer} opened the client portal`;
  if (type === "report_share") return `${viewer} viewed the report`;
  if (type === "environmental_share") return `${viewer} viewed the environmental report`;
  if (type === "email_open") return `${viewer} opened an email`;
  if (type === "email_click") return `${viewer} clicked a report link`;
  if (type === "agreement_page") return `${viewer} opened the agreement page`;
  if (type === "agreement_signed") return `${viewer} signed the agreement`;
  if (type === "payment_received") return "Payment received";
  if (type === "repair_request") return `${viewer} opened a repair request`;
  if (type === "report_time_final") return `${viewer} finished reading the report`;
  if (type === "report_time_checkpoint") return `${viewer} spent time on the report`;

  return `${viewer} activity recorded`;
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

function isRecentActivity(value: any) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
  return Date.now() - date.getTime() <= sevenDaysMs;
}

function isPublished(inspection: any) {
  return (
    inspection?.published === true ||
    String(inspection?.report_status || "").toLowerCase() === "published"
  );
}

function isTodayInspection(inspection: any) {
  if (!inspection?.inspection_date) return false;

  const today = currentLocalDate();
  return String(inspection.inspection_date).slice(0, 10) === today;
}

function getAddress(inspection: any) {
  return inspection?.property_address || inspection?.address || "Untitled Inspection";
}

function getFirstName(email: string | null | undefined) {
  const clean = String(email || "").trim();
  if (!clean) return "Inspector";

  const username = clean.split("@")[0] || "Inspector";
  const first = username.split(/[._-]/)[0] || username;

  return first.charAt(0).toUpperCase() + first.slice(1);
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function hasActivityForInspection(activityLogs: any[], inspectionId: any, types: string[]) {
  const cleanId = String(inspectionId || "");

  return activityLogs.some((log: any) => {
    const logInspectionId = String(log?.inspection_id_bigint || log?.inspection_id || "");
    return logInspectionId === cleanId && types.includes(getViewType(log));
  });
}

function getSignedAgreementKey(agreement: any) {
  return (
    String(agreement?.contact_id || "").trim() ||
    String(agreement?.client_email || "").trim().toLowerCase()
  );
}

function getContactKey(contact: any) {
  return (
    String(contact?.id || "").trim() ||
    String(contact?.email || "").trim().toLowerCase()
  );
}

function getAgreementStatsForInspection({
  inspection,
  contactsByInspectionId,
  signedAgreementMap,
}: {
  inspection: any;
  contactsByInspectionId: Record<string, any[]>;
  signedAgreementMap: Map<string, any>;
}) {
  const inspectionId = String(inspection?.id || "");
  const contacts = contactsByInspectionId[inspectionId] || [];
  const requiredContacts = contacts.filter((contact) => Boolean(contact?.agreement_required));

  const unsignedRequiredContacts = requiredContacts.filter((contact) => {
    if (contact?.agreement_signed) return false;

    const contactKey = getContactKey(contact);
    if (contactKey && signedAgreementMap.has(contactKey)) return false;

    const email = String(contact?.email || "").trim().toLowerCase();
    if (email && signedAgreementMap.has(email)) return false;

    return true;
  });

  return {
    requiredCount: requiredContacts.length,
    unsignedCount: unsignedRequiredContacts.length,
    signedCount: Math.max(0, requiredContacts.length - unsignedRequiredContacts.length),
  };
}

function getRepairShareStatus(share: any, responseCount = 0) {
  const status = String(share?.status || "").toLowerCase();
  const hasResponse = Boolean(share?.responded_at || responseCount > 0 || status === "responded");

  if (hasResponse) return "responded";
  if (status === "failed") return "failed";
  if (status === "viewed") return "viewed";
  return "sent";
}

function getInspectionAttentionItems({
  inspection,
  activityLogs,
  contactsByInspectionId,
  signedAgreementMap,
  repairSharesByInspectionId,
  responsesByShareId,
}: {
  inspection: any;
  activityLogs: any[];
  contactsByInspectionId: Record<string, any[]>;
  signedAgreementMap: Map<string, any>;
  repairSharesByInspectionId: Record<string, any[]>;
  responsesByShareId: Record<string, any[]>;
}) {
  const items: string[] = [];
  const published = isPublished(inspection);
  const paymentComplete = isPaymentComplete(inspection);
  const agreementStats = getAgreementStatsForInspection({
    inspection,
    contactsByInspectionId,
    signedAgreementMap,
  });

  const repairShares = repairSharesByInspectionId[String(inspection?.id || "")] || [];
  const waitingRepairShares = repairShares.filter((share: any) => {
    const responses = responsesByShareId[String(share?.id || "")] || [];
    return getRepairShareStatus(share, responses.length) !== "responded";
  });

  const respondedRepairShares = repairShares.filter((share: any) => {
    const responses = responsesByShareId[String(share?.id || "")] || [];
    return getRepairShareStatus(share, responses.length) === "responded";
  });

  if (!published) items.push("Draft report");
  if (agreementStats.unsignedCount > 0) {
    items.push(`${agreementStats.unsignedCount} agreement${agreementStats.unsignedCount === 1 ? "" : "s"} unsigned`);
  }
  if (!paymentComplete) {
    const balance = getBalanceDue(inspection);
    items.push(balance > 0 ? `${money(balance)} balance due` : "Payment not complete");
  }
  if (waitingRepairShares.length > 0) {
    items.push(`${waitingRepairShares.length} repair request${waitingRepairShares.length === 1 ? "" : "s"} waiting`);
  }
  if (respondedRepairShares.length > 0) {
    items.push(`${respondedRepairShares.length} seller response${respondedRepairShares.length === 1 ? "" : "s"} ready`);
  }
  if (isTodayInspection(inspection)) items.push("Scheduled today");

  return items;
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const dashboardDestination = await getDashboardDestination(user);

  if (dashboardDestination !== "/") {
    redirect(dashboardDestination);
  }

  const inspectionSelectFields = [
    "id",
    "property_address",
    "address",
    "client_name",
    "realtor_name",
    "inspection_date",
    "created_at",
    "published",
    "report_status",
    "invoice_status",
    "payment_status",
    "invoice_amount",
    "amount_paid",
    "balance_due",
  ].join(", ");

  let inspectionsResult: any = await supabase
    .from("inspections")
    .select(inspectionSelectFields)
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  if (inspectionsResult.error) {
    console.warn("Dashboard enhanced inspections query failed. Falling back to safe report list fields.", inspectionsResult.error);

    inspectionsResult = await supabase
      .from("inspections")
      .select("id, property_address, address, client_name, realtor_name, inspection_date, created_at, published, report_status")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false });
  }

  if (inspectionsResult.error) {
    console.warn("Dashboard safe inspections query failed. Falling back to original dashboard fields.", inspectionsResult.error);

    inspectionsResult = await supabase
      .from("inspections")
      .select("id, property_address, address, client_name, realtor_name, created_at")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false });
  }

  if (inspectionsResult.error) {
    console.warn("Dashboard inspections load error:", inspectionsResult.error);
  }

  const inspections = inspectionsResult.data || [];
  const inspectionIds = inspections.map((inspection: any) => Number(inspection.id)).filter(Boolean);

  const { data: activityRaw, error: activityError } =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_view_events")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null };

  if (activityError) {
    console.warn("Dashboard activity load error:", activityError);
  }

  const contactsResult =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_contacts")
          .select("*")
          .in("inspection_id", inspectionIds)
      : { data: [], error: null };

  if (contactsResult.error) {
    console.warn("Dashboard contacts load error:", contactsResult.error);
  }

  const signedAgreementsResult =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_agreements")
          .select("*")
          .in("inspection_id", inspectionIds)
      : { data: [], error: null };

  if (signedAgreementsResult.error) {
    console.warn("Dashboard signed agreements load error:", signedAgreementsResult.error);
  }

  const repairSharesResult =
    inspectionIds.length > 0
      ? await supabase
          .from("repair_request_shares")
          .select("*")
          .in("inspection_id", inspectionIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  if (repairSharesResult.error) {
    console.warn("Dashboard repair request shares load error:", repairSharesResult.error);
  }

  const repairShares = repairSharesResult.data || [];
  const repairShareIds = repairShares.map((share: any) => share.id).filter(Boolean);

  const repairResponsesResult =
    repairShareIds.length > 0
      ? await supabase
          .from("repair_request_responses")
          .select("*")
          .in("share_id", repairShareIds)
      : { data: [], error: null };

  if (repairResponsesResult.error) {
    console.warn("Dashboard repair request responses load error:", repairResponsesResult.error);
  }

  const activityLogs = activityRaw || [];
  const contacts = contactsResult.data || [];
  const signedAgreements = signedAgreementsResult.data || [];
  const repairResponses = repairResponsesResult.data || [];

  const inspectionMap = new Map<string, any>(
    inspections.map((inspection: any) => [String(inspection.id), inspection])
  );

  const contactsByInspectionId = contacts.reduce((acc: Record<string, any[]>, contact: any) => {
    const inspectionId = String(contact?.inspection_id || "");
    if (!inspectionId) return acc;
    if (!acc[inspectionId]) acc[inspectionId] = [];
    acc[inspectionId].push(contact);
    return acc;
  }, {});

  const signedAgreementMap = new Map<string, any>();
  signedAgreements.forEach((agreement: any) => {
    const key = getSignedAgreementKey(agreement);
    if (key && !signedAgreementMap.has(key)) signedAgreementMap.set(key, agreement);

    const email = String(agreement?.client_email || "").trim().toLowerCase();
    if (email && !signedAgreementMap.has(email)) signedAgreementMap.set(email, agreement);
  });

  const repairSharesByInspectionId = repairShares.reduce((acc: Record<string, any[]>, share: any) => {
    const inspectionId = String(share?.inspection_id || "");
    if (!inspectionId) return acc;
    if (!acc[inspectionId]) acc[inspectionId] = [];
    acc[inspectionId].push(share);
    return acc;
  }, {});

  const responsesByShareId = repairResponses.reduce((acc: Record<string, any[]>, response: any) => {
    const shareId = String(response?.share_id || "");
    if (!shareId) return acc;
    if (!acc[shareId]) acc[shareId] = [];
    acc[shareId].push(response);
    return acc;
  }, {});

  const visibleActivity = activityLogs
    .filter((log: any) =>
      [
        "client_portal",
        "report_share",
        "environmental_share",
        "email_open",
        "email_click",
        "agreement_page",
        "agreement_signed",
        "payment_received",
        "repair_request",
        "report_time_final",
      ].includes(getViewType(log))
    )
    .slice(0, 8);

  const todayInspections = inspections.filter(isTodayInspection);
  const draftReports = inspections.filter((inspection: any) => !isPublished(inspection));
  const publishedReports = inspections.filter(isPublished);
  const unpaidInspections = inspections.filter((inspection: any) => !isPaymentComplete(inspection));

  const agreementStats = inspections.reduce(
    (acc: { required: number; unsigned: number; signed: number }, inspection: any) => {
      const stats = getAgreementStatsForInspection({
        inspection,
        contactsByInspectionId,
        signedAgreementMap,
      });

      acc.required += stats.requiredCount;
      acc.unsigned += stats.unsignedCount;
      acc.signed += stats.signedCount;

      return acc;
    },
    { required: 0, unsigned: 0, signed: 0 }
  );

  const repairStats = repairShares.reduce(
    (acc: { total: number; waiting: number; viewed: number; responded: number; failed: number }, share: any) => {
      const responses = responsesByShareId[String(share?.id || "")] || [];
      const status = getRepairShareStatus(share, responses.length);

      acc.total += 1;
      if (status === "responded") acc.responded += 1;
      else if (status === "viewed") acc.viewed += 1;
      else if (status === "failed") acc.failed += 1;
      else acc.waiting += 1;

      return acc;
    },
    { total: 0, waiting: 0, viewed: 0, responded: 0, failed: 0 }
  );

  const recentActivityCount = activityLogs.filter((log: any) =>
    isRecentActivity(log?.created_at)
  ).length;

  const clientViewedCount = activityLogs.filter(
    (log: any) =>
      getViewType(log) === "client_portal" ||
      (getViewType(log) === "report_share" &&
        String(log?.viewer_role || "").toLowerCase() === "client")
  ).length;

  const realtorViewedCount = activityLogs.filter(
    (log: any) =>
      getViewType(log) === "report_share" &&
      String(log?.viewer_role || "").toLowerCase() === "realtor"
  ).length;

  const emailClickCount = activityLogs.filter(
    (log: any) => getViewType(log) === "email_click"
  ).length;

  const totalReadSeconds = activityLogs
    .filter((log: any) => getViewType(log) === "report_time_final")
    .reduce((sum: number, log: any) => sum + getDurationSeconds(log), 0);

  const nextInspection =
    todayInspections[0] ||
    inspections.find((inspection: any) => !isPublished(inspection)) ||
    inspections[0] ||
    null;

  const attentionItems = inspections
    .map((inspection: any) => ({
      inspection,
      items: getInspectionAttentionItems({
        inspection,
        activityLogs,
        contactsByInspectionId,
        signedAgreementMap,
        repairSharesByInspectionId,
        responsesByShareId,
      }),
    }))
    .filter((item: any) => item.items.length > 0);

  const needsAttentionCount = attentionItems.length;
  const totalBalanceDue = unpaidInspections.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <div className="mx-auto max-w-[96rem] space-y-8">
        <section className="overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#0b1220] via-[#071827] to-[#020617] p-6 shadow-2xl shadow-teal-950/30 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr] xl:items-start">
            <div>
              <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-[#14c8d2]">
                FLOW
              </p>

              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
                Command Center
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                {getGreeting()}, {getFirstName(user.email)}. Your inspections,
                report delivery, payments, agreements, and repair requests are all in one place.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/inspections/new"
                  className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
                >
                  + New Inspection
                </Link>

                <Link
                  href="/field"
                  className="rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                >
                  📱 Field Tool
                </Link>

                <Link
                  href="/schedule"
                  className="rounded-2xl border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-teal-400 active:scale-[0.98]"
                >
                  🗓️ Schedule
                </Link>

                <Link
                  href="/import-report"
                  className="rounded-2xl border border-amber-400/60 bg-amber-500/10 px-5 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-500/20 active:scale-[0.98]"
                >
                  📄 Import Report
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CommandMetric label="Today" value={String(todayInspections.length)} helper="Scheduled today" tone="teal" />
              <CommandMetric label="Drafts" value={String(draftReports.length)} helper="Not published yet" tone="yellow" />
              <CommandMetric label="Unpaid" value={String(unpaidInspections.length)} helper={totalBalanceDue > 0 ? `${money(totalBalanceDue)} due` : "Need review"} tone="orange" />
              <CommandMetric label="Repair" value={String(repairStats.waiting)} helper="Waiting response" tone="cyan" />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
                  Next Up
                </p>

                <h2 className="mt-2 text-3xl font-black text-white">
                  {nextInspection ? getAddress(nextInspection) : "No inspections yet"}
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  {nextInspection
                    ? `${nextInspection.client_name || "No client listed"} • ${formatInspectionDate(
                        nextInspection.inspection_date
                      )}`
                    : "Create your first inspection to get started."}
                </p>
              </div>

              {nextInspection ? (
                <span
                  className={
                    isPublished(nextInspection)
                      ? "rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-300"
                      : "rounded-full border border-yellow-400/50 bg-yellow-500/10 px-4 py-2 text-xs font-black text-yellow-200"
                  }
                >
                  {isPublished(nextInspection) ? "Published" : "Draft"}
                </span>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {nextInspection ? (
                <>
                  <Link
                    href={`/reports/${nextInspection.id}`}
                    className="rounded-2xl bg-teal-400 px-5 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
                  >
                    Continue Report
                  </Link>

                  <Link
                    href="/field"
                    className="rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-4 text-center text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                  >
                    Field Tool
                  </Link>

                  <Link
                    href="/reports"
                    className="rounded-2xl border border-slate-700 bg-[#020617] px-5 py-4 text-center text-sm font-black text-slate-200 transition hover:border-teal-400 active:scale-[0.98]"
                  >
                    All Reports
                  </Link>
                </>
              ) : (
                <Link
                  href="/inspections/new"
                  className="rounded-2xl bg-teal-400 px-5 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98] sm:col-span-3"
                >
                  Create Inspection
                </Link>
              )}
            </div>

            {nextInspection ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniStatus label="Payment" value={isPaymentComplete(nextInspection) ? "Complete" : "Pending"} good={isPaymentComplete(nextInspection)} />
                <MiniStatus
                  label="Agreement"
                  value={
                    getAgreementStatsForInspection({
                      inspection: nextInspection,
                      contactsByInspectionId,
                      signedAgreementMap,
                    }).unsignedCount > 0
                      ? "Unsigned"
                      : "Ready"
                  }
                  good={
                    getAgreementStatsForInspection({
                      inspection: nextInspection,
                      contactsByInspectionId,
                      signedAgreementMap,
                    }).unsignedCount === 0
                  }
                />
                <MiniStatus label="Published" value={isPublished(nextInspection) ? "Yes" : "No"} good={isPublished(nextInspection)} />
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-300">
                  Needs Attention
                </p>

                <h2 className="mt-2 text-3xl font-black text-white">
                  {needsAttentionCount}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Showing draft reports, unpaid reports, unsigned agreements, and repair requests that need follow-up.
                </p>
              </div>

              <span className="rounded-2xl bg-yellow-500/10 p-4 text-3xl">
                ⚡
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {attentionItems.slice(0, 8).map(({ inspection, items }: any) => (
                <Link
                  key={inspection.id}
                  href={`/reports/${inspection.id}`}
                  className="block rounded-2xl border border-slate-700 bg-[#020617]/80 p-4 transition hover:border-yellow-400/70 active:scale-[0.99]"
                >
                  <p className="font-black text-white">
                    {getAddress(inspection)}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {items.slice(0, 3).join(" • ")}
                  </p>
                </Link>
              ))}

              {attentionItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-[#020617]/70 p-5 text-sm text-slate-400">
                  No reports needing attention right now.
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <ActivityMetric label="Client Views" value={String(clientViewedCount)} helper="Client portal or client report opens." />
          <ActivityMetric label="Realtor Views" value={String(realtorViewedCount)} helper="Realtor report opens from tracked links." />
          <ActivityMetric label="Email Clicks" value={String(emailClickCount)} helper="Tracked report link clicks." />
          <ActivityMetric label="Read Time" value={formatDuration(totalReadSeconds)} helper="Completed report reading sessions." />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <ActivityMetric label="Unsigned Agreements" value={String(agreementStats.unsigned)} helper={`${agreementStats.required} required signer${agreementStats.required === 1 ? "" : "s"}.`} />
          <ActivityMetric label="Unpaid Reports" value={String(unpaidInspections.length)} helper={totalBalanceDue > 0 ? `${money(totalBalanceDue)} total balance due.` : "Payment status needs review."} />
          <ActivityMetric label="Repair Waiting" value={String(repairStats.waiting)} helper={`${repairStats.responded} seller response${repairStats.responded === 1 ? "" : "s"} received.`} />
          <ActivityMetric label="Published" value={String(publishedReports.length)} helper="Reports marked published." />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-teal-300">
                  Recent Activity
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  Report views, client portal opens, email clicks, agreements, payments, repair requests, and read time.
                </p>
              </div>

              <Link
                href="/analytics"
                className="rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-black text-teal-300 transition hover:bg-teal-500 hover:text-slate-950"
              >
                Analytics
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {visibleActivity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-[#020617]/70 p-6 text-center text-sm text-slate-400">
                  No tracked client or realtor activity yet.
                </div>
              ) : (
                visibleActivity.map((log: any) => {
                  const inspection: any = inspectionMap.get(
                    String(log.inspection_id_bigint || log.inspection_id || "")
                  );

                  const address =
                    inspection?.property_address ||
                    inspection?.address ||
                    "Unknown inspection";

                  return (
                    <Link
                      key={log.id || `${log.created_at}-${log.view_type}`}
                      href={`/reports/${log.inspection_id_bigint || log.inspection_id}`}
                      className="block rounded-xl border border-slate-700 bg-[#020617]/70 p-4 transition hover:border-teal-500/70 active:scale-[0.99]"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl">
                          {getActivityIcon(log)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-black text-white">
                              {getActivityTitle(log)}
                            </p>

                            <p className="text-xs font-bold text-slate-500">
                              {getRelativeTime(log.created_at)}
                            </p>
                          </div>

                          <p className="mt-1 truncate text-sm text-slate-400">
                            {address}
                          </p>

                          {getDurationSeconds(log) > 0 && (
                            <p className="mt-1 text-xs text-teal-300">
                              Read time: {formatDuration(getDurationSeconds(log))}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.href + card.title}
                href={card.href}
                className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-lg transition hover:-translate-y-0.5 hover:border-teal-500 hover:bg-[#13213a] active:scale-[0.99]"
              >
                <div className="mb-5 text-4xl">
                  {card.icon}
                </div>

                <h2 className="text-2xl font-bold text-white group-hover:text-teal-300">
                  {card.title}
                </h2>

                <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-400">
                  {card.description}
                </p>

                <p className="mt-5 font-bold text-teal-400">
                  Open →
                </p>
              </Link>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

function CommandMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "teal" | "yellow" | "green" | "cyan" | "orange";
}) {
  const classes = {
    teal: "border-teal-400/40 bg-teal-500/10 text-teal-200",
    yellow: "border-yellow-400/40 bg-yellow-500/10 text-yellow-100",
    green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    cyan: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
    orange: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-xl ${classes[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-white">
        {value}
      </p>

      <p className="mt-1 text-xs leading-5 opacity-80">
        {helper}
      </p>
    </div>
  );
}

function MiniStatus({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div
      className={
        good
          ? "rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3"
          : "rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-3"
      }
    >
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={good ? "mt-1 text-sm font-black text-emerald-200" : "mt-1 text-sm font-black text-yellow-100"}>
        {value}
      </p>
    </div>
  );
}

function ActivityMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black text-white">
        {value}
      </p>

      <p className="mt-2 text-sm leading-5 text-slate-400">
        {helper}
      </p>
    </div>
  );
}
