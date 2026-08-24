
import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";
import ConfirmSubmitButton from "../../components/ConfirmSubmitButton";
import { resolveTeamInspectorIds } from "../../lib/inspectionAccess";

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatAppValue(date, { month: "short", day: "numeric", year: "numeric" });
}

function money(value: any) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function getInspectionPrice(inspection: any) {
  const candidates = [inspection?.price, inspection?.invoice_amount, inspection?.total_price, inspection?.total, inspection?.inspection_price, inspection?.inspection_fee];
  for (const value of candidates) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const sqft = Number(String(inspection?.square_feet || inspection?.sqft || "").replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(sqft) && sqft > 0) {
    if (sqft <= 2000) return 500;
    return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
  }
  return 0;
}

export default async function RealtorsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function addRealtor(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const lastContactDate = String(formData.get("last_contact_date") || "");
    if (!name) return;
    await supabase.from("realtors").insert({ inspector_id: user.id, name, email: email || null, phone: phone || null, last_contact_date: lastContactDate || null });
    revalidatePath("/realtors");
  }

  async function deleteRealtor(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const id = String(formData.get("id") || "");
    if (!id) return;
    const teamIds = await resolveTeamInspectorIds(supabase, user.id);
    await supabase.from("realtors").delete().eq("id", id).in("inspector_id", teamIds);
    revalidatePath("/realtors");
  }

  const teamInspectorIds = await resolveTeamInspectorIds(supabase, user.id);
  // realtors and inspections both depend only on teamInspectorIds — fetch in parallel.
  const [realtorsResult, inspectionsResult] = await Promise.all([
    supabase.from("realtors").select("*").in("inspector_id", teamInspectorIds).order("name", { ascending: true }),
    supabase.from("inspections").select("*").in("inspector_id", teamInspectorIds),
  ]);
  const realtorsRaw = realtorsResult.data;
  const inspections = inspectionsResult.data || [];

  const realtors = (realtorsRaw || []).map((realtor: any) => {
    const matchedInspections = inspections.filter((inspection: any) => {
      const realtorIdMatch = inspection.realtor_id && inspection.realtor_id === realtor.id;
      const emailMatch = realtor.email && [inspection.realtor_email, inspection.agent_email].filter(Boolean).map((item: any) => String(item).toLowerCase()).includes(String(realtor.email).toLowerCase());
      const nameMatch = realtor.name && [inspection.realtor_name, inspection.agent_name].filter(Boolean).map((item: any) => String(item).toLowerCase()).includes(String(realtor.name).toLowerCase());
      return realtorIdMatch || emailMatch || nameMatch;
    });
    const sorted = [...matchedInspections].sort((a: any, b: any) => new Date(getInspectionDate(b) || 0).getTime() - new Date(getInspectionDate(a) || 0).getTime());
    return {
      ...realtor,
      totalReferrals: matchedInspections.length,
      revenueGenerated: matchedInspections.reduce((sum: number, inspection: any) => sum + getInspectionPrice(inspection), 0),
      lastInspection: sorted[0] || null,
    };
  });

  const totalRealtors = realtors.length;
  const totalReferralRevenue = realtors.reduce((sum: number, realtor: any) => sum + realtor.revenueGenerated, 0);
  const totalReferrals = realtors.reduce((sum: number, realtor: any) => sum + realtor.totalReferrals, 0);
  const topRealtor = [...realtors].sort((a: any, b: any) => b.totalReferrals - a.totalReferrals || b.revenueGenerated - a.revenueGenerated)[0];

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-[96rem]">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">FLOW</p>
              <h1 className="mt-4 text-5xl font-black text-white">Realtor Contacts</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">Store realtor contact info once, then select them when creating inspections. Report emails include realtors automatically; agreement emails stay client-only.</p>
            </div>
            <Link href="/" className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10">Back to Dashboard</Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Realtors" value={String(totalRealtors)} />
          <StatCard label="Total Referrals" value={String(totalReferrals)} />
          <StatCard label="Referral Revenue" value={money(totalReferralRevenue)} />
          <StatCard label="Top Referrer" value={topRealtor?.name || "N/A"} helper={topRealtor ? `${topRealtor.totalReferrals} referral${topRealtor.totalReferrals === 1 ? "" : "s"}` : "No referrals yet"} />
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">Add Realtor</h2>
          <form action={addRealtor} className="mt-5 grid gap-4 md:grid-cols-4">
            <input name="name" required placeholder="Name" className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" />
            <input name="email" placeholder="Email" className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" />
            <input name="phone" placeholder="Phone" className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" />
            <input name="last_contact_date" type="date" className="rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" />
            <button type="submit" className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 md:col-span-4">Save Realtor</button>
          </form>
        </section>

        <section className="mt-8 grid gap-4">
          {realtors.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 text-slate-400">No realtor contacts saved yet.</div>
          ) : (
            realtors.map((realtor: any) => (
              <article key={realtor.id} className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <h2 className="text-2xl font-black text-white">{realtor.name}</h2>
                    <p className="mt-2 text-slate-300">{realtor.email || "No email"}</p>
                    <p className="text-slate-400">{realtor.phone || "No phone"}</p>
                    <p className="mt-2 text-sm text-slate-500">Last Contact: {formatDate(realtor.last_contact_date)}</p>
                    {realtor.lastInspection && <p className="mt-2 text-sm text-slate-400">Last Inspection: {realtor.lastInspection.property_address || realtor.lastInspection.address || "Untitled Inspection"}</p>}
                  </div>
                  <div className="grid gap-3 text-right sm:grid-cols-3">
                    <Stat label="Referrals" value={String(realtor.totalReferrals)} />
                    <Stat label="Revenue" value={money(realtor.revenueGenerated)} />
                    <Stat label="Last Referral" value={realtor.lastInspection ? formatDate(getInspectionDate(realtor.lastInspection)) : "N/A"} />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={`/realtors/${realtor.id}`} className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-slate-950 hover:bg-teal-400">View Realtor</Link>
                  {realtor.lastInspection && <Link href={`/reports/${realtor.lastInspection.id}`} className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10">Open Last Inspection</Link>}
                  {realtor.email && <a href={`mailto:${realtor.email}`} className="rounded-xl border border-cyan-500 px-4 py-2 font-bold text-cyan-300 hover:bg-cyan-500/10">Email</a>}
                  {realtor.phone && <a href={`tel:${realtor.phone}`} className="rounded-xl border border-green-500 px-4 py-2 font-bold text-green-300 hover:bg-green-500/10">Call</a>}
                  <form action={deleteRealtor}><input type="hidden" name="id" value={realtor.id} /><ConfirmSubmitButton confirmMessage={`Delete realtor "${realtor.name}"? This cannot be undone.`} className="rounded-xl border border-red-500 px-4 py-2 font-bold text-red-300 hover:bg-red-500/10">Delete</ConfirmSubmitButton></form>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6 shadow-xl"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-3 text-3xl font-black text-white">{value}</p>{helper && <p className="mt-2 text-sm text-slate-400">{helper}</p>}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-700 bg-[#020817]/80 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-xl font-black text-teal-300">{value}</p></div>;
}
