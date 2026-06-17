"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RoleOption = "client" | "inspector" | "owner" | "admin";

export default function OwnerAccountActions({ userId, email, currentRole = "user", compact = false }: { userId: string; email?: string; currentRole?: string; compact?: boolean }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<RoleOption>(currentRole?.includes("owner") ? "owner" : currentRole?.includes("admin") ? "admin" : currentRole?.includes("inspector") ? "inspector" : "client");
  const [isPending, startTransition] = useTransition();
  const busy = Boolean(busyAction) || isPending;

  async function runAction(action: string, extra: Record<string, any> = {}) {
    if (busy) return;
    const labels: Record<string, string> = {
      suspend: "Suspend this account?",
      reactivate: "Reactivate this account?",
      delete: "Soft-delete this account? This does not permanently remove Supabase Auth.",
      role: `Change role to ${extra.role}?`,
      reset: "Send password reset email?",
      clear_push: "Disable saved push devices for this user?",
    };
    if (!window.confirm(labels[action] || "Run this owner action?")) return;

    setBusyAction(action); setMessage("");
    try {
      const res = await fetch("/api/owner/users/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId, email, ...extra }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Owner action failed.");
      setMessage(data.message || "Action completed.");
      startTransition(() => router.refresh());
    } catch (error: any) {
      setMessage(error?.message || "Owner action failed.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-slate-700 bg-[#020817]/70 p-4"}>
      {!compact && <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Owner Actions</p>}
      <div className="flex flex-wrap gap-2">
        <ActionButton label="Suspend" activeLabel="Suspending..." action="suspend" busyAction={busyAction} busy={busy} onClick={() => runAction("suspend")} tone="yellow" />
        <ActionButton label="Reactivate" activeLabel="Reactivating..." action="reactivate" busyAction={busyAction} busy={busy} onClick={() => runAction("reactivate")} tone="green" />
        <ActionButton label="Reset" activeLabel="Sending..." action="reset" busyAction={busyAction} busy={busy || !email} onClick={() => runAction("reset")} tone="blue" />
        <ActionButton label="Clear Push" activeLabel="Clearing..." action="clear_push" busyAction={busyAction} busy={busy} onClick={() => runAction("clear_push")} tone="purple" />
        <ActionButton label="Soft Delete" activeLabel="Deleting..." action="delete" busyAction={busyAction} busy={busy} onClick={() => runAction("delete")} tone="red" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={role} onChange={(event) => setRole(event.target.value as RoleOption)} disabled={busy} className="rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-xs font-black text-white outline-none focus:border-teal-400">
          <option value="client">Client</option><option value="inspector">Inspector</option><option value="owner">Owner</option><option value="admin">Admin</option>
        </select>
        <button type="button" onClick={() => runAction("role", { role })} disabled={busy} className="rounded-lg border border-teal-500 px-3 py-2 text-xs font-black text-teal-300 hover:bg-teal-500/10 disabled:opacity-60">{busyAction === "role" ? "Saving..." : "Change Role"}</button>
      </div>
      {message && <p className="mt-2 max-w-md text-xs font-bold text-slate-400">{message}</p>}
    </div>
  );
}
function ActionButton({ label, activeLabel, action, busyAction, busy, onClick, tone }: { label: string; activeLabel: string; action: string; busyAction: string; busy: boolean; onClick: () => void; tone: string }) {
  const classes: Record<string, string> = { yellow: "border-yellow-500 text-yellow-300 hover:bg-yellow-500/10", green: "border-green-500 text-green-300 hover:bg-green-500/10", blue: "border-blue-500 text-blue-300 hover:bg-blue-500/10", purple: "border-purple-500 text-purple-300 hover:bg-purple-500/10", red: "border-red-500 text-red-300 hover:bg-red-500/10" };
  return <button type="button" onClick={onClick} disabled={busy} className={`rounded-lg border px-3 py-2 text-xs font-black disabled:opacity-60 ${classes[tone]}`}>{busyAction === action ? activeLabel : label}</button>;
}
