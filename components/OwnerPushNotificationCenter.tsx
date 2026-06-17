"use client";

import { useMemo, useState } from "react";

type PushTarget = {
  id: string;
  label: string;
  email: string;
};

export default function OwnerPushNotificationCenter({
  users,
  nativeCount,
  webCount,
}: {
  users: PushTarget[];
  nativeCount: number;
  webCount: number;
}) {
  const [target, setTarget] = useState("all");
  const [selectedUser, setSelectedUser] = useState("");
  const [title, setTitle] = useState("On Point Inspect");
  const [body, setBody] = useState("New On Point Inspect update available.");
  const [url, setUrl] = useState("/dashboard");
  const [eventType, setEventType] = useState("owner_broadcast");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const selected = useMemo(() => {
    return users.find((user) => user.id === selectedUser);
  }, [selectedUser, users]);

  async function sendPush() {
    if (busy) return;

    if (!title.trim() || !body.trim()) {
      setMessage("Title and message are required.");
      return;
    }

    setBusy(true);
    setMessage("");
    setResult(null);

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/dashboard",
        eventType: eventType.trim() || "owner_broadcast",
        target,
      };

      if (target === "user" && selected) {
        payload.targetUserId = selected.id;
        payload.targetUserEmail = selected.email;
      }

      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send push notification.");
      }

      setResult(data);
      setMessage(
        `Sent ${data.sent || 0}. Native: ${data.nativeSent || 0}. Web: ${data.webSent || 0}. Failed: ${data.failed || 0}.`
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to send push notification.");
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(type: string) {
    if (type === "update") {
      setTitle("On Point Inspect Update");
      setBody("A new On Point Inspect update is available. Open the app to view the latest improvements.");
      setUrl("/dashboard");
      setEventType("app_update_notice");
    }

    if (type === "maintenance") {
      setTitle("On Point Inspect Maintenance");
      setBody("Scheduled maintenance is planned. Some features may be briefly unavailable.");
      setUrl("/dashboard/owner/system");
      setEventType("maintenance_notice");
    }

    if (type === "training") {
      setTitle("On Point Inspect Tip");
      setBody("New training and workflow improvements are available in your dashboard.");
      setUrl("/dashboard");
      setEventType("training_notice");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Native iOS Devices</p>
          <p className="mt-2 text-3xl font-black text-white">{nativeCount}</p>
        </div>

        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Web Push Devices</p>
          <p className="mt-2 text-3xl font-black text-white">{webCount}</p>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Total Targets</p>
          <p className="mt-2 text-3xl font-black text-white">{nativeCount + webCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-5">
        <p className="text-sm font-black uppercase tracking-wide text-teal-300">
          Broadcast Presets
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyPreset("update")} className="rounded-xl border border-blue-500 px-4 py-2 font-black text-blue-300 hover:bg-blue-500/10">
            App Update
          </button>
          <button type="button" onClick={() => applyPreset("maintenance")} className="rounded-xl border border-yellow-500 px-4 py-2 font-black text-yellow-300 hover:bg-yellow-500/10">
            Maintenance
          </button>
          <button type="button" onClick={() => applyPreset("training")} className="rounded-xl border border-green-500 px-4 py-2 font-black text-green-300 hover:bg-green-500/10">
            Training Tip
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Send To</p>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
          >
            <option value="all">All devices</option>
            <option value="native">Native iOS only</option>
            <option value="web">Web push only</option>
            <option value="user">Single user</option>
          </select>
        </label>

        {target === "user" ? (
          <label className="block">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">User</p>
            <select
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label} {user.email ? `(${user.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Open URL</p>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>
        )}
      </div>

      {target === "user" && (
        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Open URL</p>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
          />
        </label>
      )}

      <label className="block">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Title</p>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
        />
      </label>

      <label className="block">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Message</p>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
        />
      </label>

      <label className="block">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Event Type</p>
        <input
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
        />
      </label>

      {message && (
        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-4 text-sm font-bold text-teal-200">
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={sendPush}
        disabled={busy || (target === "user" && !selectedUser)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-6 py-3 font-black text-slate-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? "Sending..." : "Send Push Notification"}
      </button>

      {result && (
        <pre className="max-h-72 overflow-auto rounded-xl border border-slate-700 bg-[#020617] p-4 text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
