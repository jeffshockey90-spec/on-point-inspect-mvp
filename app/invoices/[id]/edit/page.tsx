import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../utils/supabase/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import InvoiceBuilder from "../../../../components/InvoiceBuilder";
import { normalizeCurrency } from "../../../../lib/locale";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const admin = getAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Authorize: the creator, or an owner of the invoice's company.
  let authorized = false;
  if (invoice) {
    if (invoice.inspector_id === user.id) {
      authorized = true;
    } else if (invoice.company_id) {
      const { data: ownerRow } = await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (ownerRow) authorized = true;
    }
  }

  if (!invoice || !authorized) notFound();

  let currency = "USD";
  try {
    if (invoice.company_id) {
      const { data: co } = await admin
        .from("companies")
        .select("currency")
        .eq("id", invoice.company_id)
        .maybeSingle();
      currency = normalizeCurrency((co as any)?.currency);
    }
  } catch {
    currency = "USD";
  }

  // Everything sent for THIS invoice (email + text): the invoice itself,
  // reminders, receipts, and review requests. A standalone invoice isn't tied to
  // a report, so these never show in a report's Sent list — this is their
  // "Sent" view. All invoice sends log to email_logs with metadata.invoice_id.
  const { data: sentLogsRaw } = await admin
    .from("email_logs")
    .select("email_type, recipient, status, sent_at, created_at")
    .eq("metadata->>invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(40);
  const sentLogs = sentLogsRaw || [];

  const sendLabel = (t: string) => {
    const map: Record<string, string> = {
      invoice: "📧 Invoice (email)",
      invoice_sms: "💬 Invoice (text)",
      invoice_reminder: "📧 Payment reminder (email)",
      invoice_reminder_sms: "💬 Payment reminder (text)",
      invoice_receipt_sms: "💬 Receipt (text)",
      receipt: "📧 Receipt (email)",
      review_request: "📧 Review request (email)",
      review_request_sms: "💬 Review request (text)",
    };
    return map[t] || t;
  };
  const fmtWhen = (value: any) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
  };

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-10 text-[var(--fl-text)] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Edit Invoice</h1>
          <Link
            href="/invoices"
            className="rounded-xl border border-[var(--fl-line)] px-4 py-2 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            Back to Invoices
          </Link>
        </div>
        <InvoiceBuilder initialInvoice={invoice} currency={currency} />

        <section className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5">
          <h2 className="text-lg font-bold text-[var(--fl-text)]">Sent history</h2>
          <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
            Everything sent for this invoice — email and text.
          </p>
          {sentLogs.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--fl-muted)]">Nothing sent yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {sentLogs.map((log: any, i: number) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--fl-text)]">{sendLabel(log.email_type)}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--fl-muted)]">
                      to {log.recipient} · {fmtWhen(log.sent_at || log.created_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      String(log.status) === "sent"
                        ? "border border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]"
                        : "border border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]"
                    }`}
                  >
                    {String(log.status) === "sent" ? "Sent ✓" : "Failed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
