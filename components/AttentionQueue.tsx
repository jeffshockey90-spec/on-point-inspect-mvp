"use client";

import Link from "next/link";
import { useState } from "react";

// The dashboard's "Needs Attention" panel, turned into a one-tap action queue.
// Each row shows what a job is waiting on and offers the matching action inline
// — Request Payment / Send Agreement fire the real send routes without leaving
// the dashboard; drafts and seller responses link straight into the report.

export type AttentionItem = { key: string; label: string };
export type AttentionRow = {
  id: string;
  address: string;
  client: string;
  items: AttentionItem[];
};

type ActionState = "idle" | "confirm" | "loading" | "done" | "error";

const ITEM_TONE: Record<string, string> = {
  draft: "border-violet-500/40 bg-violet-500/10 text-[var(--fl-purple-text)]",
  agreement: "border-amber-500/40 bg-amber-500/10 text-[var(--fl-warn-text)]",
  payment: "border-orange-500/40 bg-orange-500/10 text-[var(--fl-warn-text)]",
  "repair-waiting": "border-sky-500/40 bg-sky-500/10 text-[var(--fl-info-text)]",
  "repair-responded": "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
  today: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]",
};

function ItemChip({ item }: { item: AttentionItem }) {
  const tone = ITEM_TONE[item.key] || ITEM_TONE.today;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {item.label}
    </span>
  );
}

// One inline action button that POSTs to a send route. Because it sends a real
// email to the client, it uses a two-step confirm: first tap arms it, a second
// tap on "Yes, send" actually fires — so a stray click can't email a client.
function ActionButton({
  id,
  endpoint,
  idleLabel,
  doneLabel,
  confirmText,
  primary,
}: {
  id: string;
  endpoint: string;
  idleLabel: string;
  doneLabel: string;
  confirmText: string;
  primary?: boolean;
}) {
  const [state, setState] = useState<ActionState>("idle");
  const [error, setError] = useState("");

  async function run() {
    setState("loading");
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || "Send failed.");
      setState("done");
    } catch (err: any) {
      setState("error");
      setError(err?.message || "Send failed.");
    }
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-70";

  // Armed state: an explicit confirm + a cancel, so nothing sends on one tap.
  if (state === "confirm") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[11px] text-[var(--fl-muted)]">{confirmText}</span>
        <button
          type="button"
          onClick={run}
          className={`${base} bg-[var(--fl-accent)] text-[var(--fl-accent-text)] hover:opacity-90`}
        >
          Yes, send
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className={`${base} border border-[var(--fl-line)] bg-[var(--fl-surface)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]`}
        >
          Cancel
        </button>
      </span>
    );
  }

  const look =
    state === "done"
      ? "border border-emerald-400/50 bg-emerald-500/10 text-[var(--fl-good-text)]"
      : state === "error"
        ? "border border-rose-400/50 bg-rose-500/10 text-[var(--fl-crit-text)]"
        : primary
          ? "bg-[var(--fl-accent)] text-[var(--fl-accent-text)] hover:opacity-90"
          : "border border-[var(--fl-line)] bg-[var(--fl-surface)] text-[var(--fl-text)] hover:border-[var(--fl-accent)]/50";

  return (
    <button
      type="button"
      onClick={() => setState("confirm")}
      disabled={state === "loading" || state === "done"}
      className={`${base} ${look}`}
      title={error || undefined}
    >
      {state === "loading"
        ? "Sending…"
        : state === "done"
          ? `✓ ${doneLabel}`
          : state === "error"
            ? "Retry"
            : idleLabel}
    </button>
  );
}

function Row({ row }: { row: AttentionRow }) {
  const keys = new Set(row.items.map((i) => i.key));

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--fl-text)]">{row.address}</p>
          <p className="truncate text-xs text-[var(--fl-muted)]">
            {row.client || "No client listed"}
          </p>
        </div>
        <Link
          href={`/reports/${row.id}`}
          className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent)] transition-colors hover:border-[var(--fl-accent)]/50 hover:bg-[var(--fl-accent)]/10"
        >
          Open
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {row.items.map((item) => (
          <ItemChip key={item.key} item={item} />
        ))}
      </div>

      {/* Inline one-tap actions for whatever this job is waiting on. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {keys.has("payment") ? (
          <ActionButton
            id={row.id}
            endpoint="/api/send-invoice-reminder"
            idleLabel="Request Payment"
            doneLabel="Payment link sent"
            confirmText={`Email a payment link to ${row.client || "the client"}?`}
            primary
          />
        ) : null}
        {keys.has("agreement") ? (
          <ActionButton
            id={row.id}
            endpoint="/api/send-agreement-reminder"
            idleLabel="Send Agreement"
            doneLabel="Agreement sent"
            confirmText={`Email the agreement to ${row.client || "the client"}?`}
            primary={!keys.has("payment")}
          />
        ) : null}
        {keys.has("repair-responded") ? (
          <Link
            href={`/reports/${row.id}`}
            className="inline-flex items-center rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-[var(--fl-good-text)] transition-colors hover:bg-emerald-500/20"
          >
            Review Response
          </Link>
        ) : null}
        {keys.has("draft") && !keys.has("payment") && !keys.has("agreement") ? (
          <Link
            href={`/reports/${row.id}`}
            className="inline-flex items-center rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] transition-colors hover:opacity-90"
          >
            Continue Report
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function AttentionQueue({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-sm text-[var(--fl-muted)]">
        No reports needing attention right now.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </div>
  );
}
