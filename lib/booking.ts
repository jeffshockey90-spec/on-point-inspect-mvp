import { createClient as createServiceClient } from "@supabase/supabase-js";

// Shared data loaders for the public booking surfaces (the hosted /book page
// and the embeddable /embed/book widget). Service-role: these are public pages
// with no logged-in user, scoped by the company's public profile slug.
function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function getBookingCompanyBySlug(slug: string) {
  if (!slug) return null;
  const { data } = await admin()
    .from("companies")
    .select("id, name, display_name")
    .eq("profile_slug", slug)
    .maybeSingle();
  return data;
}

export async function getBookingAvailability(companyId: number | null) {
  if (!companyId) return null;
  const db = admin();

  const { data: companyUser } = await db
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle();

  if (!companyUser?.user_id) return null;

  const { data: availability } = await db
    .from("inspector_availability")
    .select("booking_enabled, available_days, default_times, blocked_dates, timezone")
    .eq("user_id", companyUser.user_id)
    .maybeSingle();

  return availability;
}
