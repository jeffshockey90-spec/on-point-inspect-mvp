"use client";

import { useMemo, useState } from "react";

type PushTarget = { id: string; label: string; email: string; role?: string };
type TargetMode = "all" | "inspectors" | "users" | "native" | "web" | "user";

export default function OwnerPushNotificationCenter({ users, nativeCount, webCount }: { users: PushTarget[]; nativeCount: number; webCount: number }) {
  const [target, setTarget] = useState<TargetMode>("all");
  const [selectedUser, setSelectedUser] = useState("");
  const [title, setTitle] = useState("FLOW");
  const [body, setBody] = useState("New FLOW update available.");
  const [url, setUrl] = useState("/dashboard");
  const [eventType, setEventType] = useState("owner_broadcast");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [result, setResult] = useState<any>(null);

  const inspectorUsers = useMemo(() => users.filter((user) => String(user.role || "").toLowerCase().includes("inspector")), [users]);
  const selected = useMemo(() => users.find((user) => user.id === selectedUser), [selectedUser, users]);

  function setNotice(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function sendPush() {
    if (busy) return;
    if (!title.trim() || !body.trim()) {
      setNotice("error", "Title and message are required.");
      return;
    }
    if (target === "user" && !selected) {
      setNotice("error", "Select a user before sending.");
      return;
    }

    setBusy(true);
    setMessage("");
    setMessageType("");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send push notification.");

      setResult(data);
      setNotice("success", `Sent ${data.sent || 0}. Native: ${data.nativeSent || 0}. Web: ${data.webSent || 0}. Failed: ${data.failed || 0}.`);
    } catch (error: any) {
      setNotice("error", error?.message || "Failed to send push notification.");
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(type: string) {
    const presets: Record<string, { title: string; body: string; url: string; eventType: string }> = {
      update: { title: "FLOW Update", body: "A new FLOW update is available. Open the app to view the latest improvements.", url: "/dashboard", eventType: "app_update_notice" },
      maintenance: { title: "FLOW Maintenance", body: "Scheduled maintenance is planned. Some features may be briefly unavailable.", url: "/dashboard/owner/system", eventType: "maintenance_notice" },
      training: { title: "FLOW Tip", body: "New training and workflow improvements are available in your dashboard.", url: "/dashboard", eventType: "training_notice" },
      agreement: { title: "Agreement Reminder", body: "Please check your dashboard for pending agreements or client updates.", url: "/dashboard", eventType: "agreement_reminder" },
      report: { title: "Report Activity", body: "New report activity has been recorded in FLOW.", url: "/dashboard/owner/live", eventType: "report_activity_notice" },
    };
    const preset = presets[type];
    if (!preset) return;
    setTitle(preset.title); setBody(preset.body); setUrl(preset.url); setEventType(preset.eventType);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Native iOS Devices" value={nativeCount} className="border-purple-500/30 bg-purple-950/20" />
        <Stat label="Web Push Devices" value={webCount} className="border-teal-500/30 bg-teal-950/20" />
        <Stat label="Total Targets" value={nativeCount + webCount} className="border-blue-500/30 bg-blue-950/20" />
        <Stat label="Inspectors" value={inspectorUsers.length} className="border-orange-500/30 bg-orange-950/20" />
      </div>

      <div className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-5">
        <p className="text-sm font-black uppercase tracking-wide text-teal-300">Broadcast Presets</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Preset label="App Update" tone="blue" onClick={() => applyPreset("update")} />
          <Preset label="Maintenance" tone="yellow" onClick={() => applyPreset("maintenance")} />
          <Preset label="Training Tip" tone="green" onClick={() => applyPreset("training")} />
          <Preset label="Agreement Reminder" tone="purple" onClick={() => applyPreset("agreement")} />
          <Preset label="Report Activity" tone="orange" onClick={() => applyPreset("report")} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Send To</p>
          <select value={target} onChange={(event) => { setTarget(event.target.value as TargetMode); setSelectedUser(""); }} className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400">
            <option value="all">All push devices</option>
            <option value="inspectors">All inspectors</option>
            <option value="users">All non-inspector users</option>
            <option value="native">Native iOS only</option>
            <option value="web">Web push only</option>
            <option value="user">Single user</option>
          </select>
        </label>

        {target === "user" ? (
          <label className="block">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">User</p>
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400">
              <option value="">Select user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.label} {user.email ? `(${user.email})` : ""} {user.role ? `- ${user.role}` : ""}</option>)}
            </select>
          </label>
        ) : (
          <TextInput label="Open URL" value={url} onChange={setUrl} />
        )}
      </div>

      {target === "user" && <TextInput label="Open URL" value={url} onChange={setUrl} />}
      <TextInput label="Title" value={title} onChange={setTitle} />
      <label className="block"><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Message</p><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400" /></label>
      <TextInput label="Event Type" value={eventType} onChange={setEventType} />

      {message && <div className={`rounded-xl border p-4 text-sm font-bold ${messageType === "success" ? "border-green-500/30 bg-green-950/20 text-green-200" : "border-red-500/30 bg-red-950/20 text-red-200"}`}>{message}</div>}

      <button type="button" onClick={sendPush} disabled={busy || (target === "user" && !selectedUser)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-6 py-3 font-black text-slate-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60">
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? "Sending..." : "Send Push Notification"}
      </button>

      {result && <pre className="max-h-72 overflow-auto rounded-xl border border-slate-700 bg-[#020617] p-4 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className={`rounded-xl border p-4 ${className}`}><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p></div>;
}
function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400" /></label>;
}
function Preset({ label, tone, onClick }: { label: string; tone: string; onClick: () => void }) {
  const classes: Record<string, string> = { blue: "border-blue-500 text-blue-300 hover:bg-blue-500/10", yellow: "border-yellow-500 text-yellow-300 hover:bg-yellow-500/10", green: "border-green-500 text-green-300 hover:bg-green-500/10", purple: "border-purple-500 text-purple-300 hover:bg-purple-500/10", orange: "border-orange-500 text-orange-300 hover:bg-orange-500/10" };
  return <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-2 font-black ${classes[tone]}`}>{label}</button>;
}
