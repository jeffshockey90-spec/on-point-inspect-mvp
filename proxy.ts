import { OWNER_EMAILS } from "./lib/ownerEmails";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";



// SEO/backlink/scraper crawlers we don't want touching the app at all. These
// provide zero value to a home-inspection SaaS and just hammer public report
// links. Matched case-insensitively as a substring of the User-Agent.
// NOTE: real search engines (Googlebot, Bingbot, DuckDuckBot, Applebot) are
// intentionally NOT here, so the public inspector directory can still be found.
const BLOCKED_BOT_UA =
  /MJ12bot|ShapBot|SERankingBacklinksBot|AhrefsBot|SemrushBot|DotBot|DataForSeoBot|BLEXBot|MegaIndex|Bytespider|PetalBot/i;

const OWNER_ONLY_PREFIXES = ["/dashboard", "/admin", "/settings/marketing-images"];

const INSPECTOR_ONLY_PREFIXES = [
  "/dashboard",
  "/reports",
  "/inspections",
  "/ai-capture",
  "/equipment-test",
  "/equipment-analyzer",
  "/field",
  "/field-tool",
  "/agreements",
  "/templates",
  "/schedule",
  "/dispatch",
  "/quotes",
  "/invoices",
  "/analytics",
  "/radon",
  "/mold",
  "/environmental-report",
  "/realtors",
  "/onboarding",
  "/mileage",
  "/emails",
  "/settings/pricing",
];

const REALTOR_ACCOUNT_PREFIXES: string[] = [
  "/support",
  "/settings",
];

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api",
  "/share",
  "/environmental-share",
  "/repair-request",
  "/repair-response",
  "/client",
  "/client-portal",
  "/client-agreement",
  // Stripe redirects the (anonymous, token-portal) client back to these after
  // checkout, so they must be reachable without a session. The success page is
  // gated by the unguessable Stripe session_id; the cancelled page shows no
  // sensitive data. Payment itself is recorded server-side via /api/stripe
  // -webhook, independent of these pages.
  "/payment-success",
  "/payment-cancelled",
  "/forgot-password",
  "/reset-password",
  "/book",
  "/embed",
  "/pricing",
  "/privacy",
  "/terms",
  // Public inspector directory + profiles and shareable demo reports. These
  // pages read via the service-role client and only expose public_profile_enabled
  // companies / demo reports, so they must be reachable without a login (a
  // prospective client or realtor opening the link should never hit a login wall).
  "/inspectors",
  "/demo",
];

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function roleLooksLikeRealtor(value: unknown) {
  const role = cleanText(value).toLowerCase();

  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("transaction") ||
    role.includes("coordinator")
  );
}

function roleLooksLikeClient(value: unknown) {
  const role = cleanText(value).toLowerCase();

  return (
    role === "client" ||
    role.includes("buyer") ||
    role.includes("co-client") ||
    role.includes("coclient") ||
    role.includes("homeowner")
  );
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createServiceClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getAccountRoute(user: { id: string; email?: string | null }) {
  const email = cleanEmail(user.email);
  const isOwner = OWNER_EMAILS.includes(email);

  if (isOwner) {
    return {
      isInspector: true,
      isRealtor: false,
      isClient: false,
      isOwner: true,
      destination: "/",
    };
  }

  const admin = createAdminClient();

  // Fail closed for non-owner accounts if the service key is unavailable.
  if (!admin || !email) {
    return {
      isInspector: false,
      isRealtor: false,
      isClient: false,
      isOwner: false,
      destination: "/login",
    };
  }

  let isInspector = false;
  let isRealtor = false;
  let isClient = false;
  let clientInspectionId = "";

  try {
    const [{ data: companyUsers }, { data: contacts }] =
      await Promise.all([
        admin
          .from("company_users")
          .select("company_id")
          .eq("user_id", user.id)
          .limit(1),
        admin
          .from("inspection_contacts")
          .select("inspection_id,role,email,portal_access")
          .ilike("email", email)
          .limit(100),
      ]);

    isInspector = Boolean(companyUsers?.length);

    for (const contact of contacts || []) {
      if (contact?.portal_access === false) continue;

      if (roleLooksLikeRealtor(contact?.role)) {
        isRealtor = true;
      }

      if (roleLooksLikeClient(contact?.role)) {
        isClient = true;
        if (!clientInspectionId && contact?.inspection_id) {
          clientInspectionId = String(contact.inspection_id);
        }
      }
    }
  } catch (error) {
    console.error("Proxy account role lookup failed:", error);
  }

  if (!isRealtor) {
    try {
      const { data } = await admin
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

      isRealtor = Boolean(data?.length);
    } catch {}
  }

  // Inspector status always wins if an account has multiple relationships.
  // Note: being an inspector does not make this account the platform owner -
  // owner-only surfaces (/dashboard, /admin) are gated separately below,
  // since other inspection companies' accounts are also "inspectors" here.
  if (isInspector) {
    return {
      isInspector: true,
      isRealtor,
      isClient,
      isOwner: false,
      destination: "/",
    };
  }

  if (isRealtor) {
    return {
      isInspector: false,
      isRealtor: true,
      isClient,
      isOwner: false,
      destination: "/realtor-portal",
    };
  }

  if (isClient && clientInspectionId) {
    return {
      isInspector: false,
      isRealtor: false,
      isClient: true,
      isOwner: false,
      destination: `/client-portal/${encodeURIComponent(clientInspectionId)}`,
    };
  }

  return {
    isInspector: false,
    isRealtor: false,
    isClient: false,
    isOwner: false,
    destination: "/login",
  };
}

export default async function middleware(request: NextRequest) {
  // Hard-block known SEO/backlink/scraper bots before doing any auth or DB
  // work. Returns 403 on every path (including the public report/share pages),
  // and short-circuits so these crawlers never cost us a Supabase lookup.
  const userAgent = request.headers.get("user-agent") || "";
  if (BLOCKED_BOT_UA.test(userAgent)) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "x-robots-tag": "noindex, nofollow" },
    });
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request: { headers: request.headers },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Narrow exception: the printable/PDF report view is opened by clients
  // (no account) from a share token via the client portal's "Download PDF"
  // link. The page itself only serves published reports for a valid token,
  // or falls back to requiring inspector login/ownership - everything else
  // under /reports stays inspector-only.
  const isPublicReportPrint = /^\/reports\/[^/]+\/print\/?$/.test(pathname);

  // The root path serves the public marketing homepage to signed-out
  // visitors and the inspector Command Center to signed-in ones - app/page.tsx
  // branches on auth state itself, so let both through here.
  const isPublicRoot = pathname === "/" && !user;

  if (isPublicRoute || isPublicReportPrint || isPublicRoot) return response;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  const account = await getAccountRoute(user);

  // Root is the inspector Command Center. Never render it for realtor/client accounts.
  if (pathname === "/" && !account.isInspector) {
    return NextResponse.redirect(new URL(account.destination, request.url));
  }

  const isInspectorOnly = INSPECTOR_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isInspectorOnly && !account.isInspector) {
    return NextResponse.redirect(new URL(account.destination, request.url));
  }

  // Platform-owner-only surfaces: every logged-in inspector account belongs
  // to some inspection company on this platform, but only OWNER_EMAILS
  // should see cross-company admin data (all users, push tokens, logs).
  const isOwnerOnly = OWNER_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isOwnerOnly && !account.isOwner) {
    return NextResponse.redirect(new URL(account.destination, request.url));
  }

  const isRealtorAccountRoute = REALTOR_ACCOUNT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (
    isRealtorAccountRoute &&
    !account.isInspector &&
    !account.isRealtor
  ) {
    return NextResponse.redirect(new URL(account.destination, request.url));
  }

  // Keep realtor-only users inside their own portal.
  if (pathname.startsWith("/realtor-portal") && account.isClient && !account.isRealtor) {
    return NextResponse.redirect(new URL(account.destination, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|manifest.json|robots.txt|sitemap.xml|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json)$).*)",
  ],
};
