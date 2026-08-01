import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import PricingEditor from "./PricingEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PricingSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">
            Personal Settings
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">My Pricing</h1>
          <p className="mt-4 text-slate-300">
            Your personal rates for Quotes and new inspections. These override your
            company&apos;s pricing for your jobs only. If you don&apos;t set anything here,
            your company&apos;s pricing applies automatically.
          </p>
        </div>

        <PricingEditor />
      </div>
    </main>
  );
}
