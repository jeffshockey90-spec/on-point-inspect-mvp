import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(value: any) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getInspectionPrice(inspection: any) {
  const candidates = [
    inspection?.price,
    inspection?.invoice_amount,
    inspection?.total_price,
    inspection?.total,
    inspection?.inspection_price,
    inspection?.inspection_fee,
  ];

  for (const value of candidates) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

export default async function RealtorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  async function addRealtor(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const lastContactDate = String(formData.get("last_contact_date") || "");

    if (!name) return;

    await supabase.from("realtors").insert({
      inspector_id: user.id,
      name,
      email: email || null,
      phone: phone || null,
      last_contact_date: lastContactDate || null,
    });

    revalidatePath("/realtors");
  }

  async function deleteRealtor(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const id = String(formData.get("id") || "");

    if (!id) return;

    await supabase.from("realtors").delete().eq("id", id).eq("inspector_id", user.id);

    revalidatePath("/realtors");
  }

  const { data: realtorsRaw } = await supabase
    .from("realtors")
    .select("*")
    .eq("inspector_id", user.id)
    .order("name", { ascending: true });

  const { data: inspectionsRaw } = await supabase
    .from("inspections")
    .select("*")
    .eq("inspector_id", user.id);

  const inspections = inspectionsRaw || [];

  const realtors = (realtorsRaw || []).map((realtor: any) => {
    const matchedInspections = inspections.filter((inspection: any) => {
      const realtorIdMatch = inspection.realtor_id && inspection.realtor_id === realtor.id;
      const emailMatch =
        realtor.email &&
        [inspection.realtor_email, inspection.agent_email]
          .filter(Boolean)
          .map((item: any) => String(item).toLowerCase())
          .includes(String(realtor.email).toLowerCase());
      const nameMatch =
        realtor.name &&
        [inspection.realtor_name, inspection.agent_name]
          .filter(Boolean)
          .map((item: any) => String(item).toLowerCase())
          .includes(String(realtor.name).toLowerCase());

      return realtorIdMatch || emailMatch || nameMatch;
    });

    const sorted = [...matchedInspections].sort((a: any, b: any) => {
      const aDate = new Date(a.inspection_date || a.created_at || 0).getTime();
      const bDate = new Date(b.inspection_date || b.created_at || 0).getTime();
      return bDate - aDate;
    });

    return {
      ...realtor,
      totalReferrals: matchedInspections.length,
      revenueGenerated: matchedInspections.reduce(
        (sum: number, inspection: any) => sum + getInspectionPrice(inspection),
        0
      ),
      lastInspection: sorted[0] || null,
    };
  });

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                On Point Inspect
              </p>

              <h1 className="mt-4 text-5xl font-black text-white">
                Realtor Contacts
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Store realtor contact info once, then select them when creating inspections. Report emails include realtors automatically; agreement emails stay client-only.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">
            Add Realtor
          </h2>

          <form action={addRealtor} className="mt-5 grid gap-4 md:grid-cols-4">
            <input
              name="name"
              required
              placeholder="Name"
              className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
            />

            <input
              name="email"
              placeholder="Email"
              className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
            />

            <input
              name="phone"
              placeholder="Phone"
              className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
            />

            <input
              name="last_contact_date"
              type="date"
              className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
            />

            <button
              type="submit"
              className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 md:col-span-4"
            >
              Save Realtor
            </button>
          </form>
        </section>

        <section className="mt-8 grid gap-4">
          {realtors.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 text-slate-400">
              No realtor contacts saved yet.
            </div>
          ) : (
            realtors.map((realtor: any) => (
              <article
                key={realtor.id}
                className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <h2 className="text-2xl font-black text-white">
                      {realtor.name}
                    </h2>
                    <p className="mt-2 text-slate-300">{realtor.email || "No email"}</p>
                    <p className="text-slate-400">{realtor.phone || "No phone"}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Last Contact: {formatDate(realtor.last_contact_date)}
                    </p>
                  </div>

                  <div className="grid gap-3 text-right sm:grid-cols-3">
                    <Stat label="Referrals" value={String(realtor.totalReferrals)} />
                    <Stat label="Revenue" value={money(realtor.revenueGenerated)} />
                    <Stat
                      label="Last Inspection"
                      value={
                        realtor.lastInspection
                          ? formatDate(realtor.lastInspection.inspection_date || realtor.lastInspection.created_at)
                          : "N/A"
                      }
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {realtor.lastInspection && (
                    <Link
                      href={`/reports/${realtor.lastInspection.id}`}
                      className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10"
                    >
                      Open Last Inspection
                    </Link>
                  )}

                  <form action={deleteRealtor}>
                    <input type="hidden" name="id" value={realtor.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-red-500 px-4 py-2 font-bold text-red-300 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/80 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-teal-300">{value}</p>
    </div>
  );
}
