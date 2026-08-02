"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";

type Alert = {
  eventType: string;
  label: string;
  when: string;
  title: string;
  body: string;
};

type Group = { group: string; items: Alert[] };

// The full catalog of owner push alerts wired into the app. Each has a sample
// payload used by the per-row "Test" button (sent only to the signed-in owner).
const CATALOG: Group[] = [
  {
    group: "Money",
    items: [
      { eventType: "payment_received", label: "Payment received", when: "a client pays an invoice", title: "💵 Payment received", body: "Test — a client just paid an inspection invoice." },
      { eventType: "subscription_created", label: "New subscription", when: "an inspector subscribes", title: "🎉 New subscription", body: "Test — an inspector started a subscription." },
      { eventType: "subscription_payment_received", label: "Subscription payment", when: "a subscription renews", title: "💳 Subscription payment", body: "Test — a subscription payment came through." },
      { eventType: "subscription_payment_failed", label: "Subscription payment failed", when: "a renewal fails", title: "⚠️ Subscription payment failed", body: "Test — a subscription payment failed." },
      { eventType: "subscription_cancel_at_period_end", label: "Subscription set to cancel", when: "an inspector schedules a cancel", title: "Subscription set to cancel", body: "Test — a subscription will cancel at period end." },
      { eventType: "subscription_cancelled", label: "Subscription cancelled", when: "a subscription ends", title: "Subscription cancelled", body: "Test — a subscription was cancelled." },
    ],
  },
  {
    group: "Clients & inspections",
    items: [
      { eventType: "new_account", label: "New signup", when: "someone creates an inspector account", title: "🎉 New Account Created", body: "Test — a new inspector just signed up." },
      { eventType: "booking_request_created", label: "New booking request", when: "a client requests an inspection", title: "📅 New booking request", body: "Test — a client requested an inspection." },
      { eventType: "agreement_signed", label: "Agreement signed", when: "a client signs the agreement", title: "Agreement Signed", body: "Test — a client signed their inspection agreement." },
      { eventType: "repair_request_response_submitted", label: "Repair-request response", when: "a realtor/client responds to a repair request", title: "🔧 Repair request response", body: "Test — someone responded to a repair request." },
      { eventType: "review_request_sent", label: "Review request sent", when: "a review request goes out", title: "⭐ Review request sent", body: "Test — a review request was sent." },
    ],
  },
  {
    group: "Support & feedback",
    items: [
      { eventType: "support_message", label: "Support message", when: "an inspector messages you", title: "💬 Support message", body: "Test — an inspector sent you a support message." },
      { eventType: "support_reply", label: "Support reply", when: "a reply lands in a support thread", title: "💬 Support reply", body: "Test — a reply came in on a support thread." },
      { eventType: "feature_request", label: "New suggestion", when: "someone submits a suggestion", title: "💡 New suggestion", body: "Test — someone submitted a feature suggestion." },
      { eventType: "changelog_entry", label: "Changelog published", when: "you publish a changelog entry", title: "🚀 Changelog published", body: "Test — a new changelog entry was published." },
    ],
  },
  {
    group: "System & security",
    items: [
      { eventType: "ai_budget_low", label: "AI budget low", when: "your OpenAI balance runs low", title: "⚠️ AI budget low", body: "Test — your AI (OpenAI) balance is running low." },
      { eventType: "security_alert", label: "Security alert", when: "someone probes your app (burst)", title: "⚠️ FLOW security alert", body: "Test — this is what an intrusion alert looks like." },
    ],
  },
];

const TOTAL = CATALOG.reduce((n, g) => n + g.items.length, 0);

export default function PushAlertsPanel() {
  const [results, setResults] = useState<Record<string, "sending" | "ok" | "fail">>({});
  const [testingAll, setTestingAll] = useState(false);
  const [note, setNote] = useState<string>("");

  async function sendTest(a: Alert): Promise<boolean> {
    setResults((r) => ({ ...r, [a.eventType]: "sending" }));
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // target "user" self-targets the signed-in owner's own devices.
        body: JSON.stringify({
          title: a.title,
          body: a.body,
          eventType: a.eventType,
          url: "/dashboard/owner",
          target: "user",
        }),
      });
      const data = await res.json().catch(() => ({}));
      const delivered = res.ok && (data?.ok ?? true);
      setResults((r) => ({ ...r, [a.eventType]: delivered ? "ok" : "fail" }));
      return Boolean(delivered);
    } catch {
      setResults((r) => ({ ...r, [a.eventType]: "fail" }));
      return false;
    }
  }

  async function testAll() {
    if (testingAll) return;
    if (!window.confirm(`This sends ${TOTAL} test notifications to your devices. Continue?`)) return;
    setTestingAll(true);
    setNote("");
    let ok = 0;
    for (const g of CATALOG) {
      for (const a of g.items) {
        // eslint-disable-next-line no-await-in-loop
        if (await sendTest(a)) ok += 1;
      }
    }
    setTestingAll(false);
    setNote(`Sent ${ok}/${TOTAL} test notifications. Check your phone — each should have arrived.`);
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0b1220] to-[#071827] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
            <BellRing className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">
              Notifications
            </p>
            <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">Push Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">
              {TOTAL} alerts wired up. Tap Test to send any one to your own devices.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={testAll}
          disabled={testingAll}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-black text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {testingAll ? "Testing…" : `Test all (${TOTAL})`}
        </button>
      </div>

      {note && (
        <p className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-200">
          {note}
        </p>
      )}

      <div className="mt-5 space-y-5">
        {CATALOG.map((g) => (
          <div key={g.group}>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
              {g.group}
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-700">
              <div className="divide-y divide-slate-800">
                {g.items.map((a) => {
                  const state = results[a.eventType];
                  return (
                    <div
                      key={a.eventType}
                      className="flex items-center justify-between gap-3 bg-[#020617]/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{a.label}</p>
                        <p className="truncate text-xs text-slate-500">Fires when {a.when}.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {state === "ok" && <span className="text-xs font-bold text-emerald-400">Sent ✓</span>}
                        {state === "fail" && <span className="text-xs font-bold text-red-400">Failed</span>}
                        <button
                          type="button"
                          onClick={() => sendTest(a)}
                          disabled={state === "sending" || testingAll}
                          className="rounded-lg border border-indigo-500/50 px-3 py-1.5 text-xs font-black text-indigo-300 transition hover:bg-indigo-500/10 disabled:opacity-50"
                        >
                          {state === "sending" ? "…" : "Test"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Tests go only to your own devices. If nothing arrives, enable push on this device with the
        &ldquo;Enable notifications&rdquo; button above.
      </p>
    </section>
  );
}
