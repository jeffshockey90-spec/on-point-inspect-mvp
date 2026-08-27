"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

type Status = {
  configured: boolean;
  from?: string;
  balance?: number | null;
  currency?: string;
  threshold?: number | null;
  lowBalance?: boolean;
  balanceError?: string | null;
};

export default function SmsStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/sms/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  async function sendTest() {
    if (!testPhone.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testPhone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult({ ok: false, message: data?.error || "Test failed to send." });
      } else {
        setTestResult({
          ok: true,
          message: `Sent to ${data.to || testPhone}. If it doesn't arrive, your A2P campaign is still pending (carriers filter until approved).`,
        });
      }
    } catch (error: any) {
      setTestResult({ ok: false, message: error?.message || "Test failed to send." });
    } finally {
      setTestSending(false);
    }
  }

  if (loading || !status) return null;

  const money = (n?: number | null, currency = "USD") =>
    typeof n === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n)
      : "—";

  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-gradient-to-br from-[var(--fl-surface)] to-[var(--fl-surface)] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 text-[var(--fl-accent-text)]">
            <MessageSquare className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
              Text Messaging
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--fl-text)] sm:text-2xl">SMS Alerts</h2>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Confirmations, reminders, and report-ready texts to clients and agents.
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            status.configured
              ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]"
              : "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]"
          }`}
        >
          {status.configured ? "Active" : "Not set up"}
        </span>
      </div>

      {!status.configured ? (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
          Add your Twilio credentials to turn on texting:{" "}
          <span className="font-mono text-xs text-[var(--fl-muted)]">
            TWILIO_ACCOUNT_SID
          </span>
          ,{" "}
          <span className="font-mono text-xs text-[var(--fl-muted)]">TWILIO_AUTH_TOKEN</span>
          , and{" "}
          <span className="font-mono text-xs text-[var(--fl-muted)]">TWILIO_PHONE_NUMBER</span>{" "}
          in your Vercel environment variables. Everything else is already wired up.
        </div>
      ) : (
        <>
          {status.lowBalance && (
            <div className="mt-5 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-[var(--fl-warn-text)]">
              <p className="font-semibold">⚠ Low SMS balance</p>
              <p className="mt-1 text-[var(--fl-warn-text)]">
                Your Twilio balance ({money(status.balance, status.currency)}) is below{" "}
                {money(status.threshold, status.currency)}. Top up your Twilio account so
                texts keep sending.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Twilio Balance
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  status.lowBalance ? "text-[var(--fl-warn-text)]" : "text-[var(--fl-accent-text)]"
                }`}
              >
                {status.balanceError ? "Unavailable" : money(status.balance, status.currency)}
              </p>
              {status.balanceError && (
                <p className="mt-1 text-xs text-[var(--fl-faint)]">{status.balanceError}</p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Sending From
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--fl-text)]">{status.from || "—"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Send a test text
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+1 (240) 555-0134"
                className="min-w-[180px] flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={testSending || !testPhone.trim()}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
              >
                {testSending ? "Sending..." : "Send test"}
              </button>
            </div>
            {testResult && (
              <p
                className={`mt-2 text-xs ${
                  testResult.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
                }`}
              >
                {testResult.message}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
