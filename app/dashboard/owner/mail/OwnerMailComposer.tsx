"use client";

import { useMemo, useState } from "react";

type Inspector = { name: string; email: string; active30: boolean; lastActivity: string | null };

const TEMPLATES: {
  id: string;
  label: string;
  subject: string;
  body: string | null; // null = auto (What's New)
}[] = [
  {
    id: "miss-you",
    label: "We miss you",
    subject: "We miss you at FLOW 👋",
    body:
      `Hi {name},\n\n` +
      `I noticed it's been a little while since your last inspection in FLOW, and I wanted to reach out personally. Whether things got busy, you ran into a snag, or FLOW just hadn't clicked into your workflow yet — I'd genuinely love to help you get back up and running.\n\n` +
      `Here's what FLOW does for you on every single job:\n` +
      `• Build your report right from the field on your phone, and finish it in minutes\n` +
      `• Let the AI draft your finding write-ups so you're not typing the same things over and over\n` +
      `• Send the client a clean, branded report — with agreements and payment in the same flow\n` +
      `• Keep scheduling, pricing, quotes, and delivery all in one place\n\n` +
      `If anything's been getting in your way, reply straight to this email and I'll help you personally. No bots, that's actually me.\n\n` +
      `Ready whenever you are:`,
  },
  {
    id: "need-help",
    label: "Need a hand?",
    subject: "Need a hand getting the most out of FLOW?",
    body:
      `Hi {name},\n\n` +
      `I want to make sure FLOW is genuinely earning its place in your business — not just another tool you signed up for and set aside.\n\n` +
      `If you've got questions, want a quick walkthrough, or there's something you wish worked differently, I'd love to hear it. A huge amount of what's in FLOW today came straight from inspectors telling us what they needed.\n\n` +
      `A few things that make the biggest difference for most inspectors getting started:\n` +
      `• Do the whole inspection from your phone, then finish the report in minutes\n` +
      `• Save time with AI-assisted finding write-ups instead of typing everything by hand\n` +
      `• Deliver a professional, branded report and collect payment without leaving FLOW\n\n` +
      `Just reply and I'll walk you through whatever you'd like. Or jump right back in here:`,
  },
  {
    id: "whats-new",
    label: "What's New (auto from changelog)",
    subject: "New in FLOW — built for inspectors like you",
    body: null,
  },
  {
    id: "ai-tools",
    label: "AI Camera + Field Tools (with pictures)",
    subject: "The AI camera writes your findings for you",
    body:
      `Hi {name},\n\n` +
      `If you're still typing out every finding by hand, you're leaving hours on the table. Two tools in FLOW change that:\n\n` +
      `1) THE AI CAMERA — Point your phone at a defect, snap a photo, and FLOW writes the whole finding (title, severity, observation, implication, recommendation) for you to approve. Open it: on any report, tap Capture Tools → Field Tool → the Live Camera tab → Open AI Camera.\n\n` +
      `2) THE COMMAND CENTER — Press Ctrl-K on any report for one workspace: AI review, publish blockers, signatures, payments, repair requests, and client engagement.\n\n` +
      `Bonus: capture offline with no signal (AI writes the findings when you're back online), or use Bulk AI Capture to turn a whole camera roll into clean findings in one pass.\n\n` +
      `Give it a shot on your next inspection — reply and tell me what you think.\n— Jeff`,
  },
  { id: "custom", label: "Custom message", subject: "", body: "" },
];

function firstSentence(text: string) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^.{0,140}?[.!?](\s|$)/);
  return (m ? m[0] : clean.slice(0, 140)).trim();
}

export default function OwnerMailComposer({ inspectors }: { inspectors: Inspector[] }) {
  const withEmail = useMemo(() => inspectors.filter((i) => i.email), [inspectors]);
  const inactive = useMemo(() => withEmail.filter((i) => !i.active30), [withEmail]);

  const [templateId, setTemplateId] = useState("");
  const [recipient, setRecipient] = useState("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const targets: Inspector[] =
    recipient === "all" ? withEmail : recipient === "inactive" ? inactive : withEmail.filter((i) => i.email === recipient);

  async function pick(id: string) {
    setTemplateId(id);
    setMsg(null);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    if (id === "whats-new") {
      setLoading(true);
      try {
        const res = await fetch("/api/changelog/list", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const entries = (data.entries || []).slice(0, 5);
        const lines = entries.map((e: any) => `• ${e.title}${e.body ? ` — ${firstSentence(e.body)}` : ""}`).join("\n\n");
        setBody(
          `Hi {name},\n\nWe've been shipping a lot lately, and I wanted to make sure you didn't miss what's new in FLOW:\n\n${
            lines || "Lots of improvements across the app."
          }\n\nEvery one of these came from making FLOW faster and easier for inspectors like you. Log in and take a look — and if there's something you'd love to see next, just reply and let me know.\n\nSee it all here:`,
        );
      } catch {
        setBody(`Hi {name},\n\nWe've shipped a bunch of updates in FLOW recently. Come check them out:`);
      }
      setLoading(false);
    } else {
      setBody(t.body || "");
    }
  }

  async function send() {
    if (!targets.length) {
      setMsg({ tone: "err", text: "No recipients selected." });
      return;
    }
    if (targets.length > 1 && !window.confirm(`Send this email to ${targets.length} inspectors?`)) return;

    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/owner/message-inspector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          template: templateId,
          recipients: targets.map((t) => ({ email: t.email, name: t.name })),
        }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.ok && data.ok) {
        setMsg({ tone: "ok", text: `Sent ${data.sent}${data.failed ? `, ${data.failed} failed` : ""}.` });
      } else {
        setMsg({ tone: "err", text: data.error || "Couldn't send." });
      }
    } catch {
      setMsg({ tone: "err", text: "Couldn't reach the server." });
    }
    setSending(false);
  }

  const inputCls = "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2.5 text-[var(--fl-text)] outline-none focus:border-teal-400";
  const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]";

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 shadow-xl sm:p-6">
      <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Compose</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Message template</label>
          <select value={templateId} onChange={(e) => pick(e.target.value)} className={inputCls}>
            <option value="">Choose a message…</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Send to</label>
          <select value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputCls}>
            <option value="all">All inspectors ({withEmail.length})</option>
            <option value="inactive">Inactive 30+ days ({inactive.length})</option>
            <optgroup label="A specific inspector">
              {withEmail.map((i) => (
                <option key={i.email} value={i.email}>{i.name} — {i.email}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {templateId && (
        <>
          <div>
            <label className={labelCls}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder="Subject" />
          </div>
          <div>
            <label className={labelCls}>Message — use {"{name}"} for the inspector&apos;s first name</label>
            <textarea
              value={loading ? "Loading your latest updates…" : body}
              onChange={(e) => setBody(e.target.value)}
              rows={13}
              className={inputCls}
              placeholder="Message"
            />
          </div>
          {templateId === "ai-tools" && (
            <p className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-[12px] font-semibold text-[var(--fl-accent-text)]">
              📸 This one sends a <strong>designed email with screenshots</strong> of the AI Camera + Command Center. The text below is just a preview — each inspector still gets the personalized greeting.
            </p>
          )}
          <p className="text-[11px] text-[var(--fl-faint)]">
            Sends from FLOW with the app logo + &quot;Open FLOW&quot; / &quot;Get the iOS App&quot; buttons. Replies go to support@flowinspect.app.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={sending || loading || !subject.trim() || !body.trim() || !targets.length}
              className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
            >
              {sending ? "Sending…" : targets.length > 1 ? `Send to ${targets.length}` : "Send email"}
            </button>
            {msg && (
              <span className={`text-sm font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
