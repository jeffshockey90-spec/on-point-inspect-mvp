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
// mail sends from here, with THEIR company name as the display name, so it's a
// neutral platform sender that works for the whole SaaS -- not tied to one
// inspector's domain. Replies are routed back to the inspector via Reply-To.
const PLATFORM_FROM_ADDRESS = "notifications@flowinspect.app";

// The verified sending address is platform-wide, but the display name is the
// inspector's own company name, so a client's inbox shows their inspector, not
// the platform. (`envFallback` is kept for call-site compatibility but the
// platform address wins unless an env override is set.)
export function buildBrandedFromHeader(branding: CompanyBranding, _envFallback?: string) {
  // Platform address is fixed to the verified flowinspect.app domain. An optional
  // PLATFORM_EMAIL_FROM env can override it; the older REPORT_EMAIL_FROM /
  // RESEND_FROM_EMAIL vars (which pointed at a single inspector's domain) are
  // intentionally ignored now.
  const configured = process.env.PLATFORM_EMAIL_FROM || PLATFORM_FROM_ADDRESS;

  const addressMatch = configured.match(/<([^>]+)>/);
  const address = addressMatch ? addressMatch[1] : configured;

  return `${branding.name} via FLOW <${address}>`;
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
