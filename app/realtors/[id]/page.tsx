
import { formatAppValue, currentLocalDate } from "../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";
import SendRealtorReportDropdown from "../../../components/SendRealtorReportDropdown";
import ConfirmSubmitButton from "../../../components/ConfirmSubmitButton";
import { resolveTeamInspectorIds } from "../../../lib/inspectionAccess";

type PageProps = { params: Promise<{ id: string }> };

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatAppValue(date, {
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

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
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

  const sqft = Number(
    String(inspection?.square_feet || inspection?.sqft || "").replace(
      /[^0-9.-]/g,
      ""
    )
  );

  if (Number.isFinite(sqft) && sqft > 0) {
    if (sqft <= 2000) return 500;
    return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
  }

  return 0;
}

function getBalanceDue(inspection: any) {
  const balance = Number(
    String(inspection?.balance_due || "").replace(/[^0-9.-]/g, "")
  );

  if (Number.isFinite(balance) && balance > 0) return balance;

  const invoiceAmount = getInspectionPrice(inspection);
  const amountPaid = Number(
    String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, "")
  );

  return Math.max(
    0,
    invoiceAmount - (Number.isFinite(amountPaid) ? amountPaid : 0)
  );
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = Number(
    String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, "")
  );

  if (price > 0 && Number.isFinite(paid) && paid >= price) return true;

  return getBalanceDue(inspection) <= 0 && paid > 0;
}

function getInspectionLabel(inspection: any) {
  const address =
    inspection.property_address || inspection.address || "Untitled Inspection";
  const client = inspection.client_name || "No client";
  const date = formatDate(getInspectionDate(inspection));

  return `${address} — ${client} — ${date}`;
}

export default async function RealtorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  async function updateRealtor(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const realtorId = String(formData.get("realtor_id") || "");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const lastContactDate = String(formData.get("last_contact_date") || "");

    if (!realtorId || !name) return;

    const teamIds = await resolveTeamInspectorIds(supabase, user.id);

    await supabase
      .from("realtors")
      .update({
        name,
        email: email || null,
        phone: phone || null,
        last_contact_date: lastContactDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", realtorId)
      .in("inspector_id", teamIds);

    revalidatePath(`/realtors/${realtorId}`);
    revalidatePath("/realtors");
  }

  async function addContactLog(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const realtorId = String(formData.get("realtor_id") || "");
    const contactDate =
      String(formData.get("contact_date") || "") ||
      currentLocalDate();
    const contactType = String(formData.get("contact_type") || "General").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!realtorId) return;

    await supabase.from("realtor_contact_logs").insert({
      inspector_id: user.id,
      realtor_id: realtorId,
      contact_date: contactDate,
      contact_type: contactType || "General",
      notes: notes || null,
    });

    const teamIds = await resolveTeamInspectorIds(supabase, user.id);

    await supabase
      .from("realtors")
      .update({
        last_contact_date: contactDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", realtorId)
      .in("inspector_id", teamIds);

    revalidatePath(`/realtors/${realtorId}`);
    revalidatePath("/realtors");
  }

  async function deleteContactLog(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const logId = String(formData.get("log_id") || "");
    const realtorId = String(formData.get("realtor_id") || "");

    if (!logId || !realtorId) return;

    const teamIds = await resolveTeamInspectorIds(supabase, user.id);

    await supabase
      .from("realtor_contact_logs")
      .delete()
      .eq("id", logId)
      .in("inspector_id", teamIds);

    revalidatePath(`/realtors/${realtorId}`);
  }

  const pageTeamIds = await resolveTeamInspectorIds(supabase, user.id);

  // The realtor row, the team's inspections, and this realtor's contact logs
  // are independent (the logs key on the same route `id` as the realtor row),
  // so fetch all three together instead of three serial round-trips.
  const [realtorResult, inspectionsResult, contactLogsResult] = await Promise.all([
    supabase.from("realtors").select("*").eq("id", id).in("inspector_id", pageTeamIds).single(),
    supabase
      .from("inspections")
      .select("*")
      .in("inspector_id", pageTeamIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("realtor_contact_logs")
      .select("*")
      .eq("realtor_id", id)
      .in("inspector_id", pageTeamIds)
      .order("contact_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const realtor = realtorResult.data;
  const realtorError = realtorResult.error;

  if (realtorError || !realtor) redirect("/realtors");

  const inspections = inspectionsResult.data || [];

  const matchedInspections = inspections
    .filter((inspection: any) => {
      const realtorIdMatch =
        inspection.realtor_id && inspection.realtor_id === realtor.id;

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
    })
    .sort(
      (a: any, b: any) =>
        new Date(getInspectionDate(b) || 0).getTime() -
        new Date(getInspectionDate(a) || 0).getTime()
    );

  const dropdownInspections = matchedInspections.map((inspection: any) => ({
    id: String(inspection.id),
    label: getInspectionLabel(inspection),
  }));

  const revenueGenerated = matchedInspections.reduce(
    (sum: number, inspection: any) => sum + getInspectionPrice(inspection),
    0
  );

  const pendingInvoices = matchedInspections.filter(
    (inspection: any) =>
      !isPaymentComplete(inspection) && getBalanceDue(inspection) > 0
  );

  const pendingBalance = pendingInvoices.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  const lastInspection = matchedInspections[0] || null;

  const contactLogs = contactLogsResult.data || [];

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                Realtor Profile
              </p>

              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">
                {realtor.name}
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Track contact info, referrals, revenue, unpaid balances, relationship notes,
                and send completed reports directly to this realtor.
              </p>
            </div>

            <Link
              href="/realtors"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
            >
              Back to Realtors
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Referrals" value={String(matchedInspections.length)} />
          <StatCard label="Revenue Generated" value={money(revenueGenerated)} />
          <StatCard
            label="Last Referral"
            value={lastInspection ? formatDate(getInspectionDate(lastInspection)) : "N/A"}
          />
          <StatCard
            label="Pending Balance"
            value={money(pendingBalance)}
            helper={`${pendingInvoices.length} unpaid inspection${
              pendingInvoices.length === 1 ? "" : "s"
            }`}
          />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
              Contact Info
            </h2>

            <form action={updateRealtor} className="mt-5 grid gap-4">
              <input type="hidden" name="realtor_id" value={realtor.id} />

              <Input name="name" label="Name" defaultValue={realtor.name} required />
              <Input name="email" label="Email" defaultValue={realtor.email || ""} />
              <Input name="phone" label="Phone" defaultValue={realtor.phone || ""} />
              <Input
                name="last_contact_date"
                label="Last Contact Date"
                type="date"
                defaultValue={realtor.last_contact_date || ""}
              />

              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
              >
                Save Contact Info
              </button>
            </form>

            <div className="mt-5 flex flex-wrap gap-3">
              {realtor.email && (
                <a
                  href={`mailto:${realtor.email}`}
                  className="rounded-xl border border-cyan-500 px-4 py-2 font-bold text-[var(--fl-info-text)] hover:bg-cyan-500/10"
                >
                  Email
                </a>
              )}

              {realtor.phone && (
                <a
                  href={`tel:${realtor.phone}`}
                  className="rounded-xl border border-green-500 px-4 py-2 font-bold text-[var(--fl-good-text)] hover:bg-green-500/10"
                >
                  Call
                </a>
              )}

              <Link
                href={`/inspections/new?realtor_id=${realtor.id}`}
                className="rounded-xl border border-purple-500 px-4 py-2 font-bold text-[var(--fl-purple-text)] hover:bg-purple-500/10"
              >
                Create Inspection
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
              Log Contact
            </h2>

            <form action={addContactLog} className="mt-5 grid gap-4">
              <input type="hidden" name="realtor_id" value={realtor.id} />

              <Input
                name="contact_date"
                label="Contact Date"
                type="date"
                defaultValue={currentLocalDate()}
              />

              <label>
                <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
                  Contact Type
                </span>

                <select
                  name="contact_type"
                  defaultValue="General"
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)]"
                >
                  <option>General</option>
                  <option>Text</option>
                  <option>Phone Call</option>
                  <option>Email</option>
                  <option>Office Drop-In</option>
                  <option>Coffee Meeting</option>
                  <option>Open House</option>
                  <option>Social Media</option>
                  <option>Referral Thank You</option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
                  Notes
                </span>

                <textarea
                  name="notes"
                  rows={5}
                  placeholder="Example: Dropped off cards and discussed same-day reports."
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)]"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
              >
                Save Contact Log
              </button>
            </form>
          </section>
        </section>

        <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[var(--fl-surface)] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fl-purple-text)]">
                Send Report To Realtor
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                Choose from this realtor&apos;s linked inspections, then send the completed report directly to their saved email. The same delivery guard is used, so reports stay blocked until agreement, payment, and publish requirements are complete.
              </p>
            </div>

            <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-purple-text)]">
              {realtor.email || "No email saved"}
            </span>
          </div>

          <div className="mt-5">
            <SendRealtorReportDropdown
              realtorEmail={realtor.email}
              inspections={dropdownInspections}
            />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
            Contact History
          </h2>

          <div className="mt-5 space-y-3">
            {contactLogs.length === 0 ? (
              <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-[var(--fl-muted)]">
                No contact logs yet.
              </div>
            ) : (
              contactLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                        {log.contact_type || "General"}
                      </p>

                      <p className="mt-1 text-lg font-bold text-[var(--fl-text)]">
                        {formatDate(log.contact_date)}
                      </p>

                      {log.notes && (
                        <p className="mt-3 whitespace-pre-line leading-7 text-[var(--fl-muted)]">
                          {log.notes}
                        </p>
                      )}
                    </div>

                    <form action={deleteContactLog}>
                      <input type="hidden" name="log_id" value={log.id} />
                      <input type="hidden" name="realtor_id" value={realtor.id} />

                      <ConfirmSubmitButton
                        confirmMessage="Delete this contact log entry? This cannot be undone."
                        className="rounded-xl border border-red-500 px-4 py-2 font-bold text-[var(--fl-crit-text)] hover:bg-red-500/10"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
            Referred Inspections
          </h2>

          <div className="mt-5 space-y-3">
            {matchedInspections.length === 0 ? (
              <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-[var(--fl-muted)]">
                No referred inspections yet.
              </div>
            ) : (
              matchedInspections.map((inspection: any) => {
                const paid = isPaymentComplete(inspection);
                const balance = getBalanceDue(inspection);

                return (
                  <Link
                    key={inspection.id}
                    href={`/reports/${inspection.id}`}
                    className="block rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 transition hover:border-teal-500/70"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-bold text-[var(--fl-text)]">
                          {inspection.property_address ||
                            inspection.address ||
                            "Untitled Inspection"}
                        </p>

                        <p className="mt-1 text-sm text-[var(--fl-muted)]">
                          {formatDate(getInspectionDate(inspection))} •{" "}
                          {inspection.client_name || "No client listed"}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-[var(--fl-accent-text)]">
                          {money(getInspectionPrice(inspection))}
                        </p>

                        <p
                          className={`mt-1 text-xs font-bold ${
                            paid ? "text-[var(--fl-good-text)]" : "text-[var(--fl-warn-text)]"
                          }`}
                        >
                          {paid ? "Paid" : `Balance Due ${money(balance)}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Input({
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
        {label}
      </span>

      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue || ""}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)]"
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-[var(--fl-text)]">{value}</p>

      {helper && <p className="mt-2 text-sm text-[var(--fl-muted)]">{helper}</p>}
    </div>
  );
}
