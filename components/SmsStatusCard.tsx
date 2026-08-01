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

  useEffect(() => {
    fetch("/api/sms/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !status) return null;

  const money = (n?: number | null, currency = "USD") =>
    typeof n === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n)
      : "—";

  return (
    <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0b1220] to-[#071827] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 text-teal-300">
            <MessageSquare className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Text Messaging
            </p>
            <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">SMS Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">
              Confirmations, reminders, and report-ready texts to clients and agents.
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${
            status.configured
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-slate-600 bg-slate-800 text-slate-400"
          }`}
        >
          {status.configured ? "Active" : "Not set up"}
        </span>
      </div>

      {!status.configured ? (
        <div className="mt-5 rounded-xl border border-slate-700 bg-[#020617]/70 p-4 text-sm leading-6 text-slate-300">
          Add your Twilio credentials to turn on texting:{" "}
          <span className="font-mono text-xs text-slate-400">
            TWILIO_ACCOUNT_SID
          </span>
          ,{" "}
          <span className="font-mono text-xs text-slate-400">TWILIO_AUTH_TOKEN</span>
          , and{" "}
          <span className="font-mono text-xs text-slate-400">TWILIO_PHONE_NUMBER</span>{" "}
          in your Vercel environment variables. Everything else is already wired up.
        </div>
      ) : (
        <>
          {status.lowBalance && (
            <div className="mt-5 rounded-xl border border-amber-500/50 bg-amber-950/30 p-4 text-sm text-amber-200">
              <p className="font-black">⚠ Low SMS balance</p>
              <p className="mt-1 text-amber-200/90">
                Your Twilio balance ({money(status.balance, status.currency)}) is below{" "}
                {money(status.threshold, status.currency)}. Top up your Twilio account so
                texts keep sending.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-[#020617]/70 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Twilio Balance
              </p>
              <p
                className={`mt-1 text-2xl font-black ${
                  status.lowBalance ? "text-amber-300" : "text-teal-300"
                }`}
              >
                {status.balanceError ? "Unavailable" : money(status.balance, status.currency)}
              </p>
              {status.balanceError && (
                <p className="mt-1 text-xs text-slate-500">{status.balanceError}</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-[#020617]/70 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Sending From
              </p>
              <p className="mt-1 text-lg font-black text-white">{status.from || "—"}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
