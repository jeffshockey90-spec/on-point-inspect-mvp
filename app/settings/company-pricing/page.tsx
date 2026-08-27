import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import PricingEditor from "../pricing/PricingEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyPricingSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Only company owners can manage the company price sheet.
  const { data: ownerMembership } = await supabase
    .from("company_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!ownerMembership) redirect("/settings/pricing");

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-warn-text)]">
            Owner Settings
          </p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Company Pricing</h1>
          <p className="mt-4 text-[var(--fl-muted)]">
            Set the default price sheet for your whole company. Every inspector on your
            team uses these rates for Quotes and new inspections — unless they set their
            own personal override in My Pricing.
          </p>
        </div>

        <PricingEditor endpoint="/api/company-pricing" mode="company" />
      </div>
    </main>
  );
}
