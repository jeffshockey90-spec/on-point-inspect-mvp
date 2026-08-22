"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  commissionPct: number | null;
};

// Owner-only editor for per-inspector commission % (feature #17). Saving posts
// to /api/company/inspectors/commission and refreshes the server component so
// the earnings table below recomputes with the new rate. An empty value clears
// the override, falling back to the company default.
export default function PaySplitCommissionEditor({
  members,
  defaultPct,
}: {
  members: Member[];
  defaultPct: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => [m.userId, m.commissionPct == null ? "" : String(m.commissionPct)])
    )
  );
  const [savingId, setSavingId] = useState("");
  const [savedId, setSavedId] = useState("");
  const [error, setError] = useState("");

  async function save(userId: string) {
    if (savingId) return;
    try {
      setSavingId(userId);
      setSavedId("");
      setError("");

      const raw = values[userId];
      const res = await fetch("/api/company/inspectors/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          commissionPct: raw === "" ? null : raw,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save commission.");

      setSavedId(userId);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Could not save commission.");
    } finally {
      setSavingId("");
    }
  }

  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4 text-sm text-slate-400">
        No inspectors on your team yet. Invite inspectors in Settings, then set their commission here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm font-bold text-red-300">
          {error}
        </p>
      )}

      {members.map((member) => {
        const current = values[member.userId] ?? "";
        const usingDefault = current === "";
        return (
          <div
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#020817]/70 p-3.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">
                {member.name}
                {member.role === "owner" && (
                  <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300">
                    Owner
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-slate-400">{member.email || "No email"}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={current}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    setValues((prev) => ({ ...prev, [member.userId]: v }));
                    setSavedId("");
                  }}
                  placeholder={String(defaultPct)}
                  className="w-24 rounded-xl border border-slate-700 bg-black px-3 py-2 pr-7 text-right text-sm font-black text-white outline-none focus:border-teal-400"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">
                  %
                </span>
              </div>

              <button
                type="button"
                onClick={() => save(member.userId)}
                disabled={savingId === member.userId}
                className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-black text-black hover:bg-teal-400 disabled:opacity-50"
              >
                {savingId === member.userId ? "Saving..." : savedId === member.userId ? "Saved ✓" : "Save"}
              </button>
            </div>

            {usingDefault && (
              <p className="w-full text-[11px] font-bold text-slate-500">
                Using company default ({defaultPct}%). Enter a value to override.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
