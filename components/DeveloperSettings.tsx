"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Trash2, Plus, KeyRound, Webhook, Send, Plug } from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
};
type Endpoint = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  created_at: string;
};

const EVENT_OPTIONS = [
  "report.sent",
  "inspection.paid",
  "agreement.signed",
  "review.received",
];

function shortDate(iso: string | null) {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DeveloperSettings({ siteUrl }: { siteUrl: string }) {
  const base = (siteUrl || "").replace(/\/$/, "");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadAll() {
    try {
      const [k, w] = await Promise.all([
        fetch("/api/settings/api-keys", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/settings/webhooks", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setKeys(k?.keys || []);
      setEndpoints(w?.endpoints || []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      /* ignore */
    }
  }

  async function createKey() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not create key.");
        return;
      }
      setCreatedKey(data.key);
      setNewKeyName("");
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/settings/api-keys?id=${id}`, { method: "DELETE" });
    loadAll();
  }

  async function createWebhook() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl, events: newEvents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not add endpoint.");
        return;
      }
      setNewUrl("");
      setNewEvents([]);
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteWebhook(id: string) {
    await fetch(`/api/settings/webhooks?id=${id}`, { method: "DELETE" });
    loadAll();
  }

  async function testWebhooks() {
    await fetch("/api/settings/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    setCopied("tested");
    setTimeout(() => setCopied(""), 1600);
  }

  const activeKeys = keys.filter((k) => !k.revoked);

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
          {error}
        </p>
      )}

      {/* API keys */}
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl sm:p-6">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-[var(--fl-info-text)]" />
          <h2 className="text-2xl font-semibold text-[var(--fl-text)]">API Keys</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
          Use a key as <code className="text-[var(--fl-info-text)]">Authorization: Bearer &lt;key&gt;</code> to call the
          FLOW API. Keys are shown once — store them somewhere safe.
        </p>

        {createdKey && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-good-text)]">
              New key — copy it now, it won't be shown again
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded-lg bg-[var(--fl-surface-2)] px-3 py-2 font-mono text-xs text-[var(--fl-good-text)]">
                {createdKey}
              </code>
              <button
                type="button"
                onClick={() => copy(createdKey, "newkey")}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950"
              >
                {copied === "newkey" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy
              </button>
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="text-xs font-semibold text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Zapier)"
            className="min-w-0 flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={createKey}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create key
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {activeKeys.length === 0 && (
            <p className="text-sm text-[var(--fl-faint)]">No API keys yet.</p>
          )}
          {activeKeys.map((k) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-bold text-[var(--fl-text)]">{k.name}</p>
                <p className="font-mono text-xs text-[var(--fl-muted)]">
                  {k.key_prefix}…  ·  last used {shortDate(k.last_used_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeKey(k.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-muted)] hover:border-red-400 hover:text-[var(--fl-crit-text)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Revoke
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Try it</p>
          <code className="mt-2 block break-all font-mono text-xs text-[var(--fl-muted)]">
            curl -H &quot;Authorization: Bearer YOUR_KEY&quot; {base}/api/v1/inspections
          </code>
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl sm:p-6">
        <div className="flex items-center gap-3">
          <Webhook className="h-6 w-6 text-[var(--fl-purple-text)]" />
          <h2 className="text-2xl font-semibold text-[var(--fl-text)]">Webhooks</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
          FLOW POSTs a signed JSON event to your URL when things happen. Verify the{" "}
          <code className="text-[var(--fl-purple-text)]">X-Flow-Signature</code> header:{" "}
          <code className="text-[var(--fl-purple-text)]">sha256 = HMAC(secret, timestamp + &quot;.&quot; + body)</code>.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://your-app.com/webhooks/flow"
            className="min-w-0 flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={createWebhook}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add endpoint
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EVENT_OPTIONS.map((ev) => {
            const on = newEvents.includes(ev);
            return (
              <button
                key={ev}
                type="button"
                onClick={() =>
                  setNewEvents((prev) => (on ? prev.filter((e) => e !== ev) : [...prev, ev]))
                }
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  on
                    ? "border-indigo-400 bg-indigo-500/20 text-[var(--fl-purple-text)]"
                    : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {ev}
              </button>
            );
          })}
          <span className="self-center text-[11px] text-[var(--fl-faint)]">
            (none selected = all events)
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {endpoints.length === 0 && <p className="text-sm text-[var(--fl-faint)]">No endpoints yet.</p>}
          {endpoints.map((e) => (
            <div key={e.id} className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 break-all font-mono text-sm text-[var(--fl-text)]">{e.url}</p>
                <button
                  type="button"
                  onClick={() => deleteWebhook(e.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-muted)] hover:border-red-400 hover:text-[var(--fl-crit-text)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--fl-muted)]">
                {e.events.length ? e.events.join(", ") : "all events"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase text-[var(--fl-faint)]">Secret</span>
                <code className="break-all rounded bg-[var(--fl-surface-2)] px-2 py-1 font-mono text-[11px] text-[var(--fl-muted)]">
                  {e.secret}
                </code>
                <button
                  type="button"
                  onClick={() => copy(e.secret, e.id)}
                  className="text-[11px] font-semibold text-[var(--fl-purple-text)] hover:text-[var(--fl-purple-text)]"
                >
                  {copied === e.id ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {endpoints.length > 0 && (
          <button
            type="button"
            onClick={testWebhooks}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-indigo-500/50 px-4 py-2.5 text-sm font-semibold text-[var(--fl-purple-text)] hover:bg-indigo-500/10"
          >
            <Send className="h-4 w-4" />
            {copied === "tested" ? "Test sent" : "Send test event"}
          </button>
        )}
      </section>

      {/* MCP */}
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl sm:p-6">
        <div className="flex items-center gap-3">
          <Plug className="h-6 w-6 text-[var(--fl-good-text)]" />
          <h2 className="text-2xl font-semibold text-[var(--fl-text)]">AI Assistant (MCP)</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
          Connect your own Claude or Gemini to FLOW and let it read and edit your reports. Point
          your MCP client at this endpoint and authenticate with an API key from above.
        </p>

        <div className="mt-4 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">MCP endpoint</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-sm text-[var(--fl-good-text)]">{base}/api/mcp</code>
            <button
              type="button"
              onClick={() => copy(`${base}/api/mcp`, "mcp")}
              className="text-[11px] font-semibold text-[var(--fl-good-text)] hover:text-[var(--fl-good-text)]"
            >
              {copied === "mcp" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            Connect (Claude Code / Mac / Linux)
          </p>
          <code className="mt-2 block break-all font-mono text-xs text-[var(--fl-muted)]">
            npx mcp-remote {base}/api/mcp --header &quot;Authorization: Bearer YOUR_KEY&quot;
          </code>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            Claude Desktop on Windows — use this in the config
          </p>
          <code className="mt-2 block break-all font-mono text-[11px] leading-5 text-[var(--fl-muted)]">
            {`"flow": { "command": "cmd", "args": ["/c","npx","-y","mcp-remote","${base}/api/mcp","--header","Authorization: Bearer YOUR_KEY"] }`}
          </code>
          <p className="mt-2 text-[11px] text-[var(--fl-faint)]">
            (Windows needs <code className="text-[var(--fl-muted)]">cmd /c</code> because Node&apos;s path has a
            space.)
          </p>
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Available tools</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["list_inspections", "get_inspection", "list_findings", "update_finding"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-[var(--fl-good-text)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
