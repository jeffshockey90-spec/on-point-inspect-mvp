import { createClient as createServiceClient } from "@supabase/supabase-js";

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

export type CompanyBranding = {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  licenseInfo: string | null;
  website: string | null;
  brandColor: string;
  tagline: string;
};

const DEFAULT_BRANDING: CompanyBranding = {
  name: "Your Home Inspection Company",
  logoUrl: null,
  phone: null,
  email: null,
  licenseInfo: null,
  website: null,
  brandColor: "#14b8a6",
  tagline: "Protecting Your Investment. One Inspection at a Time.",
};

// Every report/email is tied to an inspection's `company_id`, which points at
// a row in `companies` - that table already carries display_name, logo_url,
// license_info, etc. (added for a future branding settings page that was
// never wired up), so templates just need to read it instead of hardcoding
// "On Point Home Inspections". Falls back to a neutral default so an
// inspection with no company_id (legacy data) doesn't render blank/broken.
export function normalizeCompanyBranding(company: any): CompanyBranding {
  if (!company) return DEFAULT_BRANDING;

  return {
    name: company.display_name || company.name || DEFAULT_BRANDING.name,
    logoUrl: company.logo_url || null,
    phone: company.phone || null,
    email: company.email || null,
    licenseInfo: company.license_info || null,
    website: company.website || null,
    brandColor: company.brand_color || DEFAULT_BRANDING.brandColor,
    tagline: DEFAULT_BRANDING.tagline,
  };
}

// FLOW's own verified platform sending domain (Resend). Every inspector's client
// mail sends from here -- the DOMAIN is always flowinspect.app (DKIM/SPF verified),
// so it's a neutral platform sender that works for the whole SaaS and is never tied
// to any one inspector's own domain. The local-part and display name are branded
// with the inspector's company. Replies are routed back to the inspector via Reply-To.
const PLATFORM_FROM_ADDRESS = "notifications@flowinspect.app";

// Turn a company name into a safe email local-part, e.g.
// "On Point Home Inspections" -> "on-point-home-inspections". Only chars valid in
// an address local-part survive; empty/legacy names fall back to "notifications".
function companyEmailLocalPart(name: string): string {
  const slug = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-") // spaces & punctuation -> hyphen
    .replace(/-{2,}/g, "-") // collapse runs
    .replace(/^-+|-+$/g, "") // trim ends
    .slice(0, 40)
    .replace(/-+$/g, ""); // trim a hyphen the slice may have left
  return slug || "notifications";
}

// The verified sending DOMAIN is platform-wide (flowinspect.app), but both the
// local-part and the display name are branded to the inspector's company -- so a
// client/agent inbox shows e.g. "On Point Home Inspections
// <on-point-home-inspections@flowinspect.app>". Because the From domain stays
// flowinspect.app, DKIM/SPF/DMARC all still align (the local-part doesn't affect
// auth), so this is safe for every tenant. (`envFallback` is kept for call-site
// compatibility; a PLATFORM_EMAIL_FROM env override wins verbatim for the address.)
export function buildBrandedFromHeader(branding: CompanyBranding, _envFallback?: string) {
  // An explicit PLATFORM_EMAIL_FROM env override is respected as-is (address only);
  // the older REPORT_EMAIL_FROM / RESEND_FROM_EMAIL vars are intentionally ignored.
  const override = process.env.PLATFORM_EMAIL_FROM;
  if (override) {
    const m = override.match(/<([^>]+)>/);
    const address = m ? m[1] : override;
    return `${branding.name} <${address}>`;
  }

  const domain = PLATFORM_FROM_ADDRESS.split("@")[1] || "flowinspect.app";
  // Keep legacy/unknown-company mail on the warmed "notifications@" address.
  const local =
    branding.name && branding.name !== DEFAULT_BRANDING.name
      ? companyEmailLocalPart(branding.name)
      : "notifications";

  return `${branding.name} <${local}@${domain}>`;
}

// Replies to platform mail should reach the inspector -- use their company's
// contact email when one is set. Returns undefined when none is available.
export function brandedReplyTo(branding: CompanyBranding): string | undefined {
  return branding.email || undefined;
}

export async function getCompanyBrandingById(
  companyId: number | string | null | undefined
): Promise<CompanyBranding> {
  if (!companyId) return DEFAULT_BRANDING;

  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("name,display_name,logo_url,phone,email,license_info,website,brand_color")
    .eq("id", companyId)
    .maybeSingle();

  return normalizeCompanyBranding(data);
}

// Agreement templates that use {{INSPECTOR_OWNER}} expect an actual person's
// name (for the "Inspector Signature: ..." line) - looks up whoever owns the
// inspection's company and returns their profile name.
export async function getCompanyOwnerName(
  companyId: number | string | null | undefined
): Promise<string | null> {
  if (!companyId) return null;

  const admin = createAdminClient();

  const { data: ownerRow } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!ownerRow?.user_id) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", ownerRow.user_id)
    .maybeSingle();

  return profile?.full_name || null;
}
