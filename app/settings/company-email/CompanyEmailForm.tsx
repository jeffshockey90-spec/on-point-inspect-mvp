"use client";

import { useEffect, useState } from "react";

type Msg = { tone: "ok" | "err" | "info"; text: string };

export default function CompanyEmailForm() {
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    fetch("/api/settings/email-smtp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setHost(d.host || "");
          setPort(String(d.port || 465));
          setUser(d.user || "");
          setFromName(d.fromName || "");
          setEnabled(!!d.enabled);
          setHasPassword(!!d.hasPassword);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/settings/email-smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}) as any);
    return { res, data };
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    const { data } = await post({ test: true, host, port: Number(port), user, pass });
    setTesting(false);
    setMsg(
      data.ok
        ? { tone: "ok", text: "Connection works — your login is correct." }
        : { tone: "err", text: friendlyError(data.error) },
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const { res, data } = await post({ host, port: Number(port), user, pass, fromName, enabled });
    setSaving(false);
    if (res.ok && data.ok) {
      if (pass) setHasPassword(true);
      setPass("");
      setMsg({ tone: "ok", text: "Saved." });
    } else {
      setMsg({ tone: "err", text: data.error || "Couldn't save. Check the fields and try again." });
    }
  }

  if (loading) return <p className="text-[var(--fl-muted)]">Loading…</p>;

  const inputCls =
    "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2.5 text-[var(--fl-text)] outline-none focus:border-teal-400";
  const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 sm:p-6">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-semibold text-[var(--fl-text)]">Send from my company email</span>
            <span className="mt-1 block text-sm text-[var(--fl-muted)]">
              Adds a &quot;Resend via my company email&quot; button to your Sent Emails, so you can push
              a stuck message through your own mailbox. Resend stays your default for everything.
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-teal-500"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <div>
            <label className={labelCls}>Outgoing mail server (SMTP host)</label>
            <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.yourdomain.com" />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input className={inputCls} value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} placeholder="465" inputMode="numeric" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Email address (username)</label>
          <input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@yourdomain.com" autoComplete="email" />
        </div>

        <div>
          <label className={labelCls}>Password{hasPassword ? " (saved — leave blank to keep)" : ""}</label>
          <input
            className={inputCls}
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={hasPassword ? "••••••••" : "Your mailbox password"}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-[var(--fl-faint)]">
            Stored encrypted. If your provider uses 2-factor login, use an app password.
          </p>
        </div>

        <div>
          <label className={labelCls}>Sender name (optional)</label>
          <input className={inputCls} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="On Point Home Inspections" />
        </div>

        <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-xs leading-5 text-[var(--fl-muted)]">
          Northwest Registered Agent / businessidentity.llc email? Your server is{" "}
          <span className="font-bold text-[var(--fl-text)]">mailserver.businessidentity.llc</span>, port{" "}
          <span className="font-bold text-[var(--fl-text)]">465</span>. Username is your full email address, and
          the password is your webmail login. Note: some plans cap outgoing mail at a few sends per day.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={test}
            disabled={testing || saving}
            className="rounded-xl border border-[var(--fl-line)] px-5 py-2.5 text-sm font-semibold text-[var(--fl-text)] hover:border-teal-400 disabled:opacity-60"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || testing}
            className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {msg && (
            <span
              className={`text-sm font-bold ${
                msg.tone === "ok" ? "text-[var(--fl-good-text)]" : msg.tone === "err" ? "text-[var(--fl-crit-text)]" : "text-[var(--fl-muted)]"
              }`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function friendlyError(err?: string) {
  const e = String(err || "").toLowerCase();
  if (e.includes("invalid login") || e.includes("auth") || e.includes("535")) {
    return "Login rejected — double-check the email address and password.";
  }
  if (e.includes("econn") || e.includes("timeout") || e.includes("enotfound") || e.includes("getaddrinfo")) {
    return "Couldn't reach the server — check the host and port.";
  }
  return "Couldn't connect. Check the server, port, username, and password.";
}
