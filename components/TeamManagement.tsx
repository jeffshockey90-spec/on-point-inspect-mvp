"use client";

import { useEffect, useState } from "react";

type TeamMember = {
  id: number;
  userId: string;
  role: string;
  name: string;
  email: string | null;
  createdAt: string;
};

export default function TeamManagement() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [removingId, setRemovingId] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setError("");
      const res = await fetch("/api/company/inspectors/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load team.");
      setTeam(data.team || []);
      setIsOwner(Boolean(data.isOwner));
      setCurrentUserId(data.currentUserId || "");
    } catch (err: any) {
      setError(err?.message || "Could not load team.");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite() {
    if (!name.trim() || !email.trim() || inviting) return;

    try {
      setInviting(true);
      setInviteError("");
      setInviteSuccess("");

      const res = await fetch("/api/company/inspectors/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send invite.");

      setName("");
      setEmail("");
      setInviteSuccess(`Invite sent to ${email.trim()}.`);
      await load();
    } catch (err: any) {
      setInviteError(err?.message || "Could not send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    if (removingId) return;
    if (!window.confirm("Remove this person from your team? They'll lose access to company data.")) return;

    try {
      setRemovingId(userId);
      const res = await fetch("/api/company/inspectors/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not remove team member.");

      await load();
    } catch (err: any) {
      setError(err?.message || "Could not remove team member.");
    } finally {
      setRemovingId("");
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">Team</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">Your Inspectors</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fl-muted)]">
        {isOwner
          ? "Invite inspectors to join your company. They'll get an email to set their password and can start working on inspections once they're on the team."
          : "Everyone on your company's team."}
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
          {error}
        </p>
      )}

      {isOwner && (
        <div className="mt-5 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Invite an Inspector</h3>

          {inviteError && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs font-bold text-[var(--fl-crit-text)]">
              {inviteError}
            </p>
          )}
          {inviteSuccess && (
            <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs font-bold text-[var(--fl-good-text)]">
              {inviteSuccess}
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
          </div>

          <button
            type="button"
            onClick={sendInvite}
            disabled={!name.trim() || !email.trim() || inviting}
            className="mt-3 w-full rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50 sm:w-auto"
          >
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="text-sm text-[var(--fl-muted)]">Loading team...</p>
        ) : team.length === 0 ? (
          <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-sm text-[var(--fl-muted)]">
            No team members yet.
          </p>
        ) : (
          team.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--fl-text)]">
                  {member.name}
                  {member.userId === currentUserId && (
                    <span className="ml-2 text-xs font-bold text-[var(--fl-accent-text)]">(You)</span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--fl-muted)]">{member.email || "No email"}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${
                    member.role === "owner"
                      ? "border-amber-400/40 bg-amber-500/10 text-[var(--fl-warn-text)]"
                      : "border-cyan-400/40 bg-cyan-500/10 text-[var(--fl-info-text)]"
                  }`}
                >
                  {member.role}
                </span>

                {isOwner && member.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.userId)}
                    disabled={removingId === member.userId}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-[var(--fl-crit-text)] hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {removingId === member.userId ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
