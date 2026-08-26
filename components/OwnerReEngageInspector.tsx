"use client";

import { useState } from "react";

// Canned re-engagement emails the owner can pick from a dropdown and one-click
// send. "What's New" auto-builds its body from the live changelog every time.
const TEMPLATES: {
  id: string;
  label: string;
  subject: string;
  body: ((firstName: string) => string) | null;
}[] = [
  {
    id: "miss-you",
    label: "We miss you",
    subject: "We miss you at FLOW 👋",
    body: (n) =>
      `Hi ${n},\n\nIt's been a little while since your last inspection in FLOW — we'd love to have you back.\n\nIf anything's been getting in your way (pricing, a feature, or just getting set up), reply to this email and I'll help you personally.\n\nJump back in whenever you're ready:`,
  },
  {
    id: "need-help",
    label: "Need a hand?",
    subject: "Need a hand getting the most out of FLOW?",
    body: (n) =>
      `Hi ${n},\n\nI want to make sure FLOW is actually working for your business. If you'd like a quick walkthrough, or you've got questions, just reply to this email — happy to help.\n\nOr dive right back in here:`,
  },
  {
    id: "whats-new",
    label: "What's New (auto from changelog)",
    subject: "New in FLOW — built for inspectors like you",
    body: null, // auto-generated from /api/changelog/list
  },
  {
    id: "custom",
    label: "Custom message",
    subject: "",
    body: () => "",
  },
];

function firstSentence(text: string) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^.{0,140}?[.!?](\s|$)/);
  return (m ? m[0] : clean.slice(0, 140)).trim();
}

export default function OwnerReEngageInspector({ email, name }: { email: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const firstName = String(name || "there").trim().split(/\s+/)[0] || "there";

  async function pick(id: string) {
    setTemplateId(id);
    setResult(null);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);

    if (id === "whats-new") {
      setLoading(true);
      try {
        const res = await fetch("/api/changelog/list", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const entries = (data.entries || []).slice(0, 4);
        const lines = entries
          .map((e: any) => `• ${e.title}${e.body ? ` — ${firstSentence(e.body)}` : ""}`)
          .join("\n");
        setBody(
          `Hi ${firstName},\n\nWe've been busy — here's what's new in FLOW:\n\n${
            lines || "Lots of improvements across the app."
          }\n\nCome see it all:`,
        );
      } catch {
        setBody(`Hi ${firstName},\n\nWe've shipped a bunch of updates in FLOW recently. Come check them out:`);
      }
      setLoading(false);
    } else {
      setBody(t.body ? t.body(firstName) : "");
    }
  }

  async function send() {
    if (!email) {
      setResult({ ok: false, text: "This inspector has no email on file." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/owner/message-inspector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, body }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.ok && data.ok) {
        setResult({ ok: true, text: `Sent to ${email}` });
        setTemplateId("");
        setSubject("");
        setBody("");
      } else {
        setResult({ ok: false, text: data.error || "Couldn't send." });
      }
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    }
    setSending(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!email}
        className="w-full rounded-xl border border-orange-500/50 px-4 py-2.5 text-sm font-black text-orange-300 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        title={email ? "" : "No email on file"}
      >
        ✉️ Re-engage
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-orange-500/40 bg-orange-950/10 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-orange-300">Re-engage by email</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-200">
          Close
        </button>
      </div>

      <select
        value={templateId}
        onChange={(e) => pick(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
      >
        <option value="">Choose a message…</option>
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {templateId && (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
          />
          <textarea
            value={loading ? "Loading your latest updates…" : body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            placeholder="Message"
            className="w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm leading-6 text-white outline-none focus:border-orange-400"
          />
          <p className="text-[11px] text-slate-500">
            Sends from FLOW to <span className="font-bold text-slate-300">{email}</span>; replies come back to you. An
            &quot;Open FLOW&quot; button is added automatically.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={sending || loading || !subject.trim() || !body.trim()}
            className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-orange-400 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send email"}
          </button>
        </>
      )}

      {result && (
        <p className={`text-sm font-bold ${result.ok ? "text-emerald-300" : "text-red-300"}`}>{result.text}</p>
      )}
    </div>
  );
}
