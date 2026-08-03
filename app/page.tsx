
import { formatAppValue, currentLocalDate } from "../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { OWNER_EMAILS } from "../lib/ownerEmails";
import {
  getBalanceDue,
  isPaymentComplete,
  isPublished,
  getSignedAgreementKey,
  getAgreementStatsForInspection,
} from "../lib/inspectionStatus";
import DashboardTour from "../components/DashboardTour";
import MarketingHomepage from "../components/MarketingHomepage";
import CommandSearchTrigger from "../components/CommandSearchTrigger";
import SetupChecklist from "../components/SetupChecklist";
import DashboardTrends from "../components/DashboardTrends";
import {
  Plus,
  Smartphone,
  CalendarDays,
  FileDown,
  Rocket,
  FileText,
  BarChart3,
  Building2,
  Trophy,
  DollarSign,
  FileSignature,
  Lock,
  Wrench,
  Radiation,
  FlaskConical,
  Sparkles,
  Search,
  LayoutTemplate,
  Calculator,
  Lightbulb,
  Zap,
  MailOpen,
  MousePointerClick,
  CheckCircle2,
  Clock,
  Bell,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cards = [
  { title: "Getting Started", description: "Set up your account, create sample data, and walk through your first inspection.", href: "/onboarding", icon: Rocket },
  { title: "New Inspection", description: "Start a new inspection.", href: "/inspections/new", icon: Plus },
  { title: "Reports", description: "View and edit reports.", href: "/reports", icon: FileText },
  { title: "Analytics", description: "Track revenue, inspections, payments, agreements, and reports.", href: "/analytics", icon: BarChart3 },
  { title: "Realtors", description: "Manage realtor contacts, referrals, and revenue.", href: "/realtors", icon: Building2 },
  { title: "Referral Leaderboard", description: "Rank realtor referrals, revenue, paid inspections, and outstanding balances.", href: "/realtors/leaderboard", icon: Trophy },
  { title: "Invoices", description: "Track paid, pending, overdue, and outstanding balances.", href: "/invoices", icon: DollarSign },
  { title: "Agreements", description: "Manage agreement templates, sending, and signed status.", href: "/agreements", icon: FileSignature },
  { title: "Client Portal", description: "Open client portals from reports after selecting an inspection.", href: "/reports", icon: Lock },
  { title: "Repair Requests", description: "Open repair requests from reports after selecting an inspection.", href: "/reports", icon: Wrench },
  { title: "Radon", description: "Manage radon tests, readings, devices, and results.", href: "/radon", icon: Radiation },
  { title: "Mold", description: "Track mold samples, lab reports, results, and summaries.", href: "/mold", icon: FlaskConical },
  { title: "AI Capture", description: "Create findings from photos.", href: "/ai-capture", icon: Sparkles },
  { title: "Equipment Analyzer", description: "Read data plates and document equipment inventory.", href: "/equipment-analyzer", icon: Search },
  { title: "Field Tool", description: "Mobile AI inspection workflow.", href: "/field", icon: Smartphone },
  { title: "Templates", description: "Manage favorite findings, templates, and reusable language.", href: "/templates", icon: LayoutTemplate },
  { title: "Quotes", description: "Calculate pricing.", href: "/quotes", icon: Calculator },
  { title: "Schedule", description: "View inspection schedule.", href: "/schedule", icon: CalendarDays },
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

  // A signed-in user with no email/no service lookup still shouldn't be bounced
  // back to /login (they're already authenticated - that's a dead-end loop).
  // Send them to onboarding to get set up.
  if (!url || !serviceKey || !email) return "/onboarding";

  const admin = createServiceClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const [{ data: companyUsers }, { data: contacts }] =
    await Promise.all([
      admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1),
      admin
        .from("inspection_contacts")
        .select("inspection_id,role,portal_access")
        .ilike("email", email)
        .limit(100),
    ]);

  if (companyUsers?.length) return "/";

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

  const clientInspectionIds = Array.from(
    new Set(
      (contacts || [])
        .filter(
          (contact: any) =>
            contact?.portal_access !== false &&
            roleLooksLikeClientForRouting(contact?.role) &&
            contact?.inspection_id,
        )
        .map((contact: any) => String(contact.inspection_id).trim()),
    ),
  );

  if (clientInspectionIds.length === 1) {
    return `/client-portal/${encodeURIComponent(clientInspectionIds[0])}`;
  }

  if (clientInspectionIds.length > 1) {
    return "/client-portal";
  }

  // Authenticated but not recognized as owner/inspector/realtor/client - land on
  // onboarding rather than looping back to /login.
  return "/onboarding";
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

function formatEmailType(value: any) {
  const type = String(value || "").toLowerCase();

  if (type === "appointment_confirmed") return "Schedule Confirmation";
  if (type === "agreement_email") return "Agreement";
  if (type === "inspection_report") return "Report";
  if (type === "repair_request") return "Repair Request";
  if (type === "review_request") return "Review Request";

  return type
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Email";
}

function getEmailLogStatus(log: any) {
  if (log?.bounced_at || log?.failed_at || log?.status === "failed") {
    return { label: "Failed", tone: "border-red-500/40 bg-red-500/10 text-red-300" };
  }

  if (log?.clicked_at) {
    return { label: "Clicked", tone: "border-teal-400/40 bg-teal-500/10 text-teal-200" };
  }

  if (log?.opened_at) {
    return { label: "Opened", tone: "border-blue-400/40 bg-blue-500/10 text-blue-200" };
  }

  if (log?.delivered_at) {
    return { label: "Delivered", tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
  }

  return { label: "Sent", tone: "border-slate-600 bg-slate-800/60 text-slate-300" };
}

function getActivityIcon(log: any) {
  const type = getViewType(log);

  const cls = "h-5 w-5";
  if (type === "client_portal") return <Lock className={cls} />;
  if (type === "report_share") return <FileText className={cls} />;
  if (type === "environmental_share") return <FlaskConical className={cls} />;
  if (type === "email_open") return <MailOpen className={cls} />;
  if (type === "email_click") return <MousePointerClick className={cls} />;
  if (type === "agreement_page") return <FileSignature className={cls} />;
  if (type === "agreement_signed") return <CheckCircle2 className={cls} />;
  if (type === "payment_received") return <DollarSign className={cls} />;
  if (type === "repair_request") return <Wrench className={cls} />;
  if (type === "report_time_final" || type === "report_time_checkpoint") return <Clock className={cls} />;

  return <Bell className={cls} />;
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

  if (!user) return <MarketingHomepage />;

  const dashboardDestination = await getDashboardDestination(user);

  if (dashboardDestination !== "/") {
    redirect(dashboardDestination);
  }

  const { data: tourProfile } = await supabase
    .from("profiles")
    .select("dashboard_tour_dismissed_at")
    .eq("id", user.id)
    .maybeSingle();

  const { data: latestChangelogEntries } = await supabase
    .from("changelog_entries")
    .select("id, title, body, credited_user_name, published_at")
    .order("published_at", { ascending: false })
    .limit(3);

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

  if (inspections.length === 0) {
    redirect("/onboarding");
  }

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

  const emailLogsResult =
    inspectionIds.length > 0
      ? await supabase
          .from("email_logs")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [], error: null };

  if (emailLogsResult.error) {
    console.warn("Dashboard email logs load error:", emailLogsResult.error);
  }

  const recentEmailLogs = emailLogsResult.data || [];

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

  const collectedRevenue = inspections.reduce(
    (sum: number, inspection: any) => sum + getNumber(inspection.amount_paid),
    0
  );

  // Assign every inspection to a single pipeline stage - its earliest
  // incomplete step - so the funnel reads as a true funnel.
  const todayKey = currentLocalDate();

  const stageForInspection = (inspection: any): string => {
    if (!isPublished(inspection)) {
      const dateKey = String(inspection.inspection_date || "").slice(0, 10);
      return dateKey && dateKey >= todayKey ? "scheduled" : "report";
    }

    const unsigned = getAgreementStatsForInspection({
      inspection,
      contactsByInspectionId,
      signedAgreementMap,
    }).unsignedCount;

    if (unsigned > 0) return "agreement";
    if (!isPaymentComplete(inspection)) return "payment";
    return "delivered";
  };

  const jobsWithStage = inspections.map((inspection: any) => ({
    inspection,
    stage: stageForInspection(inspection),
  }));

  const pipelineCounts = [
    { key: "scheduled", label: "Scheduled", hint: "Upcoming" },
    { key: "report", label: "In Report", hint: "Being written" },
    { key: "agreement", label: "Agreement", hint: "Awaiting signature" },
    { key: "payment", label: "Payment", hint: "Awaiting payment" },
    { key: "delivered", label: "Delivered", hint: "Complete" },
  ].map((stage) => ({
    ...stage,
    count: jobsWithStage.filter((job: any) => job.stage === stage.key).length,
  }));

  const activeJobs = jobsWithStage
    .filter((job: any) => job.stage !== "delivered")
    .slice(0, 8);

  // Last 6 months of inspections + collected revenue, bucketed by created_at.
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trendNow = new Date();
  const monthlyTrends = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(trendNow.getFullYear(), trendNow.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: MONTH_LABELS[date.getMonth()],
      inspections: 0,
      revenue: 0,
    };
  });
  const trendBucketMap = new Map(monthlyTrends.map((bucket) => [bucket.key, bucket]));
  inspections.forEach((inspection: any) => {
    if (!inspection.created_at) return;
    const created = new Date(inspection.created_at);
    if (Number.isNaN(created.getTime())) return;
    const bucket = trendBucketMap.get(`${created.getFullYear()}-${created.getMonth()}`);
    if (!bucket) return;
    bucket.inspections += 1;
    bucket.revenue += getNumber(inspection.amount_paid);
  });

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <DashboardTour initialDismissed={Boolean(tourProfile?.dashboard_tour_dismissed_at)} />
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
                  data-tour="tour-new-inspection"
                  className="inline-flex items-center gap-2 rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> New Inspection
                </Link>

                <Link
                  href="/field"
                  data-tour="tour-field-tool"
                  className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                >
                  <Smartphone className="h-4 w-4" strokeWidth={2.5} /> Field Tool
                </Link>

                <Link
                  href="/schedule"
                  data-tour="tour-schedule"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-teal-400 active:scale-[0.98]"
                >
                  <CalendarDays className="h-4 w-4" strokeWidth={2.5} /> Schedule
                </Link>

                <Link
                  href="/import-report"
                  className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/60 bg-amber-500/10 px-5 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-500/20 active:scale-[0.98]"
                >
                  <FileDown className="h-4 w-4" strokeWidth={2.5} /> Import Report
                </Link>
              </div>
            </div>

            <div data-tour="tour-metrics" className="flex flex-col gap-3 xl:justify-end">
              <CommandSearchTrigger />
              <div className="grid grid-cols-3 gap-3">
                <CommandMetric label="Today" value={String(todayInspections.length)} helper="Scheduled" tone="teal" />
                <CommandMetric label="Drafts" value={String(draftReports.length)} helper="Unpublished" tone="yellow" />
                <CommandMetric label="Repair" value={String(repairStats.waiting)} helper="Waiting" tone="cyan" />
              </div>
            </div>
          </div>
        </section>

        <SetupChecklist />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Collected" value={money(collectedRevenue)} sub="Payments received" accent="teal" />
          <KpiTile label="Outstanding" value={money(totalBalanceDue)} sub={`${unpaidInspections.length} unpaid`} accent="amber" />
          <KpiTile label="Needs Attention" value={String(needsAttentionCount)} sub="Items to follow up" accent="rose" />
          <KpiTile label="Published" value={`${publishedReports.length}/${inspections.length}`} sub="Reports delivered" accent="emerald" />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
                Pipeline
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                Every job, at a glance
              </h2>
            </div>
            <Link
              href="/reports"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-200"
            >
              All Reports
            </Link>
          </div>
          <PipelineFunnel stages={pipelineCounts} />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
                Active Jobs
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                {activeJobs.length} in progress
              </h2>
            </div>
            <Link
              href="/reports"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-200"
            >
              View all
            </Link>
          </div>
          <JobsTable jobs={activeJobs} />
        </section>

        <DashboardTrends data={monthlyTrends} />

        <section className="overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-[#0b1220] via-[#0b1220] to-amber-950/10 p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.3em] text-amber-300">
                <Rocket className="h-3.5 w-3.5" strokeWidth={2.5} /> What&apos;s New
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Latest updates to FLOW
              </h2>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/whats-new"
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-200"
              >
                See All Updates
              </Link>
              <Link
                href="/support"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/10 px-4 py-2.5 text-sm font-black text-amber-200 transition hover:bg-amber-500/20"
              >
                <Lightbulb className="h-4 w-4" strokeWidth={2.5} /> Suggest a Feature
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {(latestChangelogEntries || []).length === 0 ? (
              <div className="md:col-span-3 rounded-xl border border-dashed border-slate-700 bg-[#020617]/70 p-5 text-sm text-slate-400">
                No updates posted yet. Got an idea for FLOW? Use the suggestion box above - Jeff sees it the moment
                you submit it.
              </div>
            ) : (
              latestChangelogEntries!.map((entry: any) => (
                <Link
                  key={entry.id}
                  href="/whats-new"
                  className="block rounded-xl border border-slate-700 bg-[#020617]/70 p-4 transition hover:border-amber-400/60 active:scale-[0.99]"
                >
                  <p className="text-xs font-bold text-slate-500">
                    {getRelativeTime(entry.published_at)}
                  </p>
                  <p className="mt-1 font-black text-white">{entry.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{entry.body}</p>
                  {entry.credited_user_name && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-amber-300">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Requested by {entry.credited_user_name}
                    </p>
                  )}
                </Link>
              ))
            )}
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

              <span className="flex items-center justify-center rounded-2xl bg-yellow-500/10 p-4 text-yellow-300">
                <Zap className="h-7 w-7" strokeWidth={2.25} />
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
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-300">
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

          <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <h2 className="mb-5 text-2xl font-black text-teal-300">All Tools</h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cards.map((card) => {
                const CardIcon = card.icon;
                return (
                <Link
                  key={card.href + card.title}
                  href={card.href}
                  data-tour={card.title === "Getting Started" ? "tour-getting-started" : undefined}
                  className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#020617]/70 p-3 transition hover:border-teal-500 hover:bg-[#13213a] active:scale-[0.99]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-teal-300 transition group-hover:border-teal-500/60 group-hover:text-teal-200">
                    <CardIcon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-white group-hover:text-teal-300">
                      {card.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {card.description}
                    </span>
                  </span>
                </Link>
                );
              })}
            </div>
          </section>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <div>
            <h2 className="text-2xl font-black text-teal-300">
              Recent Email Activity
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Schedule confirmations, agreements, and reports sent from FLOW, with delivery and open status.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {recentEmailLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-[#020617]/70 p-6 text-center text-sm text-slate-400">
                No emails sent yet.
              </div>
            ) : (
              recentEmailLogs.map((log: any) => {
                const inspection: any = inspectionMap.get(
                  String(log.inspection_id_bigint || log.inspection_id || "")
                );

                const address =
                  inspection?.property_address ||
                  inspection?.address ||
                  "Unknown inspection";

                const status = getEmailLogStatus(log);

                return (
                  <Link
                    key={log.id || `${log.created_at}-${log.recipient_email}`}
                    href={`/reports/${log.inspection_id_bigint || log.inspection_id}`}
                    className="block rounded-xl border border-slate-700 bg-[#020617]/70 p-4 transition hover:border-teal-500/70 active:scale-[0.99]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-white">
                          {formatEmailType(log.email_type)}
                        </p>

                        <p className="mt-1 truncate text-sm text-slate-400">
                          {log.recipient_email || log.recipient || "Unknown recipient"} · {address}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${status.tone}`}
                        >
                          {status.label}
                        </span>

                        <span className="text-xs font-bold text-slate-500">
                          {getRelativeTime(log.sent_at || log.created_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
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

const STAGE_META: Record<
  string,
  { label: string; color: string; chip: string; dot: string }
> = {
  scheduled: { label: "Scheduled", color: "text-sky-300", chip: "border-sky-500/40 bg-sky-500/10", dot: "bg-sky-400" },
  report: { label: "In Report", color: "text-violet-300", chip: "border-violet-500/40 bg-violet-500/10", dot: "bg-violet-400" },
  agreement: { label: "Agreement", color: "text-amber-300", chip: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400" },
  payment: { label: "Payment", color: "text-orange-300", chip: "border-orange-500/40 bg-orange-500/10", dot: "bg-orange-400" },
  delivered: { label: "Delivered", color: "text-emerald-300", chip: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400" },
};

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "teal" | "amber" | "rose" | "emerald";
}) {
  const ring = {
    teal: "border-teal-500/30",
    amber: "border-amber-500/30",
    rose: "border-rose-500/30",
    emerald: "border-emerald-500/30",
  }[accent];

  const dot = {
    teal: "bg-teal-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    emerald: "bg-emerald-400",
  }[accent];

  return (
    <div className={`rounded-2xl border ${ring} bg-[#0b1220] p-5 shadow-xl`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
      </div>
      <p className="mt-3 text-4xl font-black tracking-tight text-white tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  );
}

function PipelineFunnel({
  stages,
}: {
  stages: { key: string; label: string; hint: string; count: number }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stages.map((stage, index) => {
        const meta = STAGE_META[stage.key] || STAGE_META.report;

        return (
          <div
            key={stage.key}
            className="relative rounded-2xl border border-slate-800 bg-[#020617]/70 p-4"
          >
            <div className="flex items-center justify-between">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <span className="text-3xl font-black tabular-nums text-white">
                {stage.count}
              </span>
            </div>
            <p className={`mt-3 text-sm font-black ${meta.color}`}>
              {stage.label}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{stage.hint}</p>
            {index < stages.length - 1 ? (
              <span className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 text-xl font-black text-slate-700 lg:block">
                ›
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StagePill({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] || STAGE_META.report;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${meta.chip} ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function PaymentChip({ inspection }: { inspection: any }) {
  const paid = isPaymentComplete(inspection);
  const balance = getBalanceDue(inspection);

  return (
    <span
      className={
        paid
          ? "text-xs font-black text-emerald-300"
          : "text-xs font-black text-orange-300"
      }
    >
      {paid ? "Paid" : balance > 0 ? `${money(balance)} due` : "Due"}
    </span>
  );
}

function JobsTable({
  jobs,
}: {
  jobs: { inspection: any; stage: string }[];
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-[#020617]/70 p-8 text-center text-sm text-slate-400">
        No active jobs - everything is delivered. Nice work.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2">Property / Client</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Payment</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(({ inspection, stage }) => (
            <tr
              key={inspection.id}
              className="border-b border-slate-800/70 transition hover:bg-[#13213a]"
            >
              <td className="px-3 py-3">
                <p className="font-black text-white">{getAddress(inspection)}</p>
                <p className="text-xs text-slate-500">
                  {inspection.client_name || "No client listed"}
                </p>
              </td>
              <td className="px-3 py-3">
                <StagePill stage={stage} />
              </td>
              <td className="px-3 py-3">
                <PaymentChip inspection={inspection} />
              </td>
              <td className="px-3 py-3 text-sm tabular-nums text-slate-400">
                {formatInspectionDate(inspection.inspection_date)}
              </td>
              <td className="px-3 py-3 text-right">
                <Link
                  href={`/reports/${inspection.id}`}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-black text-teal-300 transition hover:border-teal-400 hover:bg-teal-500/10"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
