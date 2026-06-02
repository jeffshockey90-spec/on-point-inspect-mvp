import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function getBalanceDue(inspection: any) {
  const balance = Number(String(inspection?.balance_due || "").replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(balance) && balance > 0) return balance;
  const invoiceAmount = getInspectionPrice(inspection);
  const amountPaid = Number(String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, ""));
  return Math.max(0, invoiceAmount - (Number.isFinite(amountPaid) ? amountPaid : 0));
}

function isPaymentComplete(inspection: any) {
  const status = String(inspection?.payment_status || inspection?.invoice_status || "").toLowerCase();
  if (status === "paid" || status === "waived") return true;
  const price = getInspectionPrice(inspection);
  const paid = Number(String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, ""));
  if (price > 0 && Number.isFinite(paid) && paid >= price) return true;
  return getBalanceDue(inspection) <= 0 && paid > 0;
}

export default async function RealtorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function updateRealtor(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const realtorId = String(formData.get("realtor_id") || "");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const lastContactDate = String(formData.get("last_contact_date") || "");
    if (!realtorId || !name) return;
    await supabase.from("realtors").update({ name, email: email || null, phone: phone || null, last_contact_date: lastContactDate || null, updated_at: new Date().toISOString() }).eq("id", realtorId).eq("inspector_id", user.id);
    revalidatePath(`/realtors/${realtorId}`);
    revalidatePath("/realtors");
  }

  async function addContactLog(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const realtorId = String(formData.get("realtor_id") || "");
    const contactDate = String(formData.get("contact_date") || "") || new Date().toISOString().slice(0, 10);
    const contactType = String(formData.get("contact_type") || "General").trim();
    const notes = String(formData.get("notes") || "").trim();
    if (!realtorId) return;
    await supabase.from("realtor_contact_logs").insert({ inspector_id: user.id, realtor_id: realtorId, contact_date: contactDate, contact_type: contactType || "General", notes: notes || null });
    await supabase.from("realtors").update({ last_contact_date: contactDate, updated_at: new Date().toISOString() }).eq("id", realtorId).eq("inspector_id", user.id);
    revalidatePath(`/realtors/${realtorId}`);
    revalidatePath("/realtors");
  }

  async function deleteContactLog(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const logId = String(formData.get("log_id") || "");
    const realtorId = String(formData.get("realtor_id") || "");
    if (!logId || !realtorId) return;
    await supabase.from("realtor_contact_logs").delete().eq("id", logId).eq("inspector_id", user.id);
    revalidatePath(`/realtors/${realtorId}`);
  }

  const { data: realtor, error: realtorError } = await supabase.from("realtors").select("*").eq("id", id).eq("inspector_id", user.id).single();
  if (realtorError || !realtor) redirect("/realtors");

  const { data: inspectionsRaw } = await supabase.from("inspections").select("*").eq("inspector_id", user.id).order("created_at", { ascending: false });
  const inspections = inspectionsRaw || [];

  const matchedInspections = inspections.filter((inspection: any) => {
    const realtorIdMatch = inspection.realtor_id && inspection.realtor_id === realtor.id;
    const emailMatch = realtor.email && [inspection.realtor_email, inspection.agent_email].filter(Boolean).map((item: any) => String(item).toLowerCase()).includes(String(realtor.email).toLowerCase());
    const nameMatch = realtor.name && [inspection.realtor_name, inspection.agent_name].filter(Boolean).map((item: any) => String(item).toLowerCase()).includes(String(realtor.name).toLowerCase());
    return realtorIdMatch || emailMatch || nameMatch;
  }).sort((a: any, b: any) => new Date(getInspectionDate(b) || 0).getTime() - new Date(getInspectionDate(a) || 0).getTime());

  const revenueGenerated = matchedInspections.reduce((sum: number, inspection: any) => sum + getInspectionPrice(inspection), 0);
  const pendingInvoices = matchedInspections.filter((inspection: any) => !isPaymentComplete(inspection) && getBalanceDue(inspection) > 0);
  const pendingBalance = pendingInvoices.reduce((sum: number, inspection: any) => sum + getBalanceDue(inspection), 0);
  const lastInspection = matchedInspections[0] || null;

  const { data: contactLogsRaw } = await supabase.from("realtor_contact_logs").select("*").eq("realtor_id", realtor.id).eq("inspector_id", user.id).order("contact_date", { ascending: false }).order("created_at", { ascending: false });
  const contactLogs = contactLogsRaw || [];

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">Realtor Profile</p>
              <h1 className="mt-4 text-5xl font-black text-white">{realtor.name}</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">Track contact info, referrals, revenue, unpaid balances, and relationship notes for this realtor.</p>
            </div>
            <Link href="/realtors" className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10">Back to Realtors</Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Referrals" value={String(matchedInspections.length)} />
          <StatCard label="Revenue Generated" value={money(revenueGenerated)} />
          <StatCard label="Last Referral" value={lastInspection ? formatDate(getInspectionDate(lastInspection)) : "N/A"} />
          <StatCard label="Pending Balance" value={money(pendingBalance)} helper={`${pendingInvoices.length} unpaid inspection${pendingInvoices.length === 1 ? "" : "s"}`} />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
            <h2 className="text-2xl font-black text-teal-300">Contact Info</h2>
            <form action={updateRealtor} className="mt-5 grid gap-4">
              <input type="hidden" name="realtor_id" value={realtor.id} />
              <Input name="name" label="Name" defaultValue={realtor.name} required />
              <Input name="email" label="Email" defaultValue={realtor.email || ""} />
              <Input name="phone" label="Phone" defaultValue={realtor.phone || ""} />
              <Input name="last_contact_date" label="Last Contact Date" type="date" defaultValue={realtor.last_contact_date || ""} />
              <button type="submit" className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400">Save Contact Info</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              {realtor.email && <a href={`mailto:${realtor.email}`} className="rounded-xl border border-cyan-500 px-4 py-2 font-bold text-cyan-300 hover:bg-cyan-500/10">Email</a>}
              {realtor.phone && <a href={`tel:${realtor.phone}`} className="rounded-xl border border-green-500 px-4 py-2 font-bold text-green-300 hover:bg-green-500/10">Call</a>}
              <Link href={`/inspections/new?realtor_id=${realtor.id}`} className="rounded-xl border border-purple-500 px-4 py-2 font-bold text-purple-300 hover:bg-purple-500/10">Create Inspection</Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
            <h2 className="text-2xl font-black text-teal-300">Log Contact</h2>
            <form action={addContactLog} className="mt-5 grid gap-4">
              <input type="hidden" name="realtor_id" value={realtor.id} />
              <Input name="contact_date" label="Contact Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              <label><span className="mb-2 block text-sm font-bold text-slate-300">Contact Type</span><select name="contact_type" defaultValue="General" className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"><option>General</option><option>Text</option><option>Phone Call</option><option>Email</option><option>Office Drop-In</option><option>Coffee Meeting</option><option>Open House</option><option>Social Media</option><option>Referral Thank You</option></select></label>
              <label><span className="mb-2 block text-sm font-bold text-slate-300">Notes</span><textarea name="notes" rows={5} placeholder="Example: Dropped off cards and discussed same-day reports." className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" /></label>
              <button type="submit" className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400">Save Contact Log</button>
            </form>
          </section>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">Contact History</h2>
          <div className="mt-5 space-y-3">
            {contactLogs.length === 0 ? <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-slate-400">No contact logs yet.</div> : contactLogs.map((log: any) => <div key={log.id} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-wide text-teal-300">{log.contact_type || "General"}</p><p className="mt-1 text-lg font-bold text-white">{formatDate(log.contact_date)}</p>{log.notes && <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">{log.notes}</p>}</div><form action={deleteContactLog}><input type="hidden" name="log_id" value={log.id} /><input type="hidden" name="realtor_id" value={realtor.id} /><button type="submit" className="rounded-xl border border-red-500 px-4 py-2 font-bold text-red-300 hover:bg-red-500/10">Delete</button></form></div></div>)}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">Referred Inspections</h2>
          <div className="mt-5 space-y-3">
            {matchedInspections.length === 0 ? <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-slate-400">No referred inspections yet.</div> : matchedInspections.map((inspection: any) => { const paid = isPaymentComplete(inspection); const balance = getBalanceDue(inspection); return <Link key={inspection.id} href={`/reports/${inspection.id}`} className="block rounded-xl border border-slate-700 bg-[#020817]/70 p-5 transition hover:border-teal-500/70"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-lg font-bold text-white">{inspection.property_address || inspection.address || "Untitled Inspection"}</p><p className="mt-1 text-sm text-slate-400">{formatDate(getInspectionDate(inspection))} • {inspection.client_name || "No client listed"}</p></div><div className="text-right"><p className="font-black text-teal-300">{money(getInspectionPrice(inspection))}</p><p className={`mt-1 text-xs font-bold ${paid ? "text-green-300" : "text-yellow-300"}`}>{paid ? "Paid" : `Balance Due ${money(balance)}`}</p></div></div></Link>; })}
          </div>
        </section>
      </div>
    </main>
  );
}

function Input({ name, label, defaultValue, type = "text", required = false }: { name: string; label: string; defaultValue?: string; type?: string; required?: boolean }) {
  return <label><span className="mb-2 block text-sm font-bold text-slate-300">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue || ""} className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white" /></label>;
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6 shadow-xl"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-3 text-3xl font-black text-white">{value}</p>{helper && <p className="mt-2 text-sm text-slate-400">{helper}</p>}</div>;
}
