import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { formatAppValue } from "../../lib/app-time";
import { isPublished } from "../../lib/inspectionStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function cleanEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function roleLooksLikeClient(value: unknown) {
  const role = String(value || "").trim().toLowerCase();

  return (
    role === "client" ||
    role.includes("buyer") ||
    role.includes("co-client") ||
    role.includes("coclient") ||
    role.includes("homeowner")
  );
}

function getAddress(inspection: any) {
  return inspection?.property_address || inspection?.address || "Property Address Not Entered";
}

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || null;
}

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return formatAppValue(date, { month: "short", day: "numeric", year: "numeric" });
}

export default async function ClientPortalListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = cleanEmail(user.email);
  const admin = createAdminClient();

  const { data: contacts } = await admin
    .from("inspection_contacts")
    .select("inspection_id,role,portal_access")
    .ilike("email", email)
    .limit(200);

  const inspectionIds = Array.from(
    new Set(
      (contacts || [])
        .filter((contact: any) => contact?.portal_access !== false && roleLooksLikeClient(contact?.role))
        .map((contact: any) => String(contact?.inspection_id || "").trim())
        .filter(Boolean)
    )
  );

  if (inspectionIds.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0e13] px-6 text-center text-white">
        <p className="text-2xl font-semibold">No Reports Found</p>
        <p className="max-w-md text-[#8a93a3]">
          We couldn&apos;t find any inspection reports linked to {user.email}. If you were expecting
          to see a report here, contact your inspector.
        </p>
      </main>
    );
  }

  if (inspectionIds.length === 1) {
    redirect(`/client-portal/${encodeURIComponent(inspectionIds[0])}`);
  }

  const { data: inspectionsRaw } = await admin
    .from("inspections")
    .select("*")
    .in("id", inspectionIds);

  const inspections = (inspectionsRaw || []).sort(
    (a: any, b: any) =>
      new Date(getInspectionDate(b) || 0).getTime() - new Date(getInspectionDate(a) || 0).getTime()
  );

  return (
    <main className="min-h-screen bg-[#0a0e13] px-4 pb-6 pt-4 text-white md:px-8 md:pb-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 mt-4">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-teal-400">Client Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Your Reports</h1>
          <p className="mt-3 max-w-2xl text-[#8a93a3]">
            {inspections.length} inspection report{inspections.length === 1 ? "" : "s"} linked to{" "}
            {user.email}.
          </p>
        </div>

        <div className="space-y-4">
          {inspections.map((inspection: any) => {
            const id = String(inspection.id);
            const published = isPublished(inspection);

            return (
              <a
                key={id}
                href={`/client-portal/${encodeURIComponent(id)}`}
                className="block rounded-2xl border border-[#1a212c] bg-[#10151e] p-6 shadow-xl transition hover:border-teal-500/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-white">{getAddress(inspection)}</p>
                    <p className="mt-2 text-sm text-[#8a93a3]">
                      Inspection Date: {formatDate(getInspectionDate(inspection))}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase ${
                      published
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-yellow-500/50 bg-yellow-500/10 text-yellow-300"
                    }`}
                  >
                    {published ? "Report Ready" : "In Progress"}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
