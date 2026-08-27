import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import AiWritingStudioEditor from "./AiWritingStudioEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiWritingStudioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Company-wide AI settings are owner-only, matching Company Pricing.
  const { data: ownerMembership } = await supabase
    .from("company_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!ownerMembership) redirect("/settings");

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
            AI Studio
          </p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">AI Writing Studio</h1>
          <p className="mt-4 max-w-2xl text-[var(--fl-muted)]">
            Control how the AI writes your finding narratives — the standard it references, how
            long and technical each write-up is, and its tone. Applies to every new finding in
            the field tool and live camera. You can still fine-tune any individual finding as
            you review it.
          </p>
        </div>

        <AiWritingStudioEditor />
      </div>
    </main>
  );
}
