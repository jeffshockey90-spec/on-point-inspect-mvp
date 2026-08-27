import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import CompanyEmailForm from "./CompanyEmailForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyEmailSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-400">Personal Settings</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Company Email</h1>
          <p className="mt-4 leading-7 text-[#8a93a3]">
            Connect your own mailbox so you can push a stuck email through it when the normal delivery
            service can&apos;t reach a client (this happens most with older or mistyped addresses).
            It&apos;s a manual, per-email fallback — everyday sending is unchanged, and the email keeps
            its delivered / opened / clicked tracking.
          </p>
        </div>

        <CompanyEmailForm />
      </div>
    </main>
  );
}
