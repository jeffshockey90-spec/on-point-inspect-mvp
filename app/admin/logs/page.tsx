import { OWNER_EMAILS } from "../../../lib/ownerEmails";

import { redirect } from "next/navigation";
import { formatAppValue } from "../../../lib/app-time";
import { createClient } from "../../../utils/supabase/server";



type LogRow = {
  id: number;
  created_at: string;
  [key: string]: any;
};

function formatDate(value: string) {
  if (!value) return "";
  return formatAppValue(new Date(value), {});
}

function LogTable({
  title,
  rows,
}: {
  title: string;
  rows: LogRow[] | null;
}) {
  return (
    <section className="rounded-2xl border border-teal-800/50 bg-[#131923]/80 p-5 shadow-lg">
      <h2 className="mb-4 text-xl font-bold text-teal-300">
        {title}
      </h2>

      {!rows || rows.length === 0 ? (
        <p className="text-sm text-[#8a93a3]">
          No logs yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#232b38] text-[#8a93a3]">
                <th className="p-2">Date</th>
                <th className="p-2">ID</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#1a212c] align-top text-[#e8ecf3]"
                >
                  <td className="whitespace-nowrap p-2 text-[#8a93a3]">
                    {formatDate(row.created_at)}
                  </td>

                  <td className="p-2 text-[#8a93a3]">
                    {row.id}
                  </td>

                  <td className="p-2">
                    <pre className="max-h-56 overflow-auto rounded-xl bg-[#0a0e13] p-3 text-xs text-[#e8ecf3]">
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminLogsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(userEmail)) {
    redirect("/");
  }

  const { data: appLogs } = await supabase
    .from("app_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: emailLogs } = await supabase
    .from("email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: stripeLogs } = await supabase
    .from("stripe_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: aiLogs } = await supabase
    .from("ai_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-400">
            Admin
          </p>

          <h1 className="text-3xl font-bold text-white">
            System Logs
          </h1>

          <p className="mt-2 max-w-3xl text-[#8a93a3]">
            Read-only production logging dashboard for app activity,
            audit trails, emails, Stripe payments, and AI requests.
          </p>
        </header>

        <LogTable
          title="App Logs"
          rows={appLogs}
        />

        <LogTable
          title="Audit Logs"
          rows={auditLogs}
        />

        <LogTable
          title="Email Logs"
          rows={emailLogs}
        />

        <LogTable
          title="Stripe Logs"
          rows={stripeLogs}
        />

        <LogTable
          title="AI Logs"
          rows={aiLogs}
        />
      </div>
    </main>
  );
}