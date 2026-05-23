"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../utils/supabase/client";

export default function ShareReportModal({
  reportId,
}: {
  reportId: string;
}) {
  const supabase = createClient();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("client");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("role", ["client", "realtor"]);

      if (data) {
        setProfiles(data);
      }
    }

    loadProfiles();
  }, []);

  async function shareReport() {
    if (!selectedUser) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("report_access")
      .insert({
        report_id: reportId,
        user_id: selectedUser,
        role: selectedRole,
      });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Report shared successfully.");
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-xl font-semibold text-white">
        Share Report
      </h2>

      <div className="mt-4 space-y-4">
        <select
          value={selectedUser}
          onChange={(e) =>
            setSelectedUser(e.target.value)
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        >
          <option value="">
            Select User
          </option>

          {profiles.map((profile) => (
            <option
              key={profile.id}
              value={profile.id}
            >
              {profile.full_name} ({profile.role})
            </option>
          ))}
        </select>

        <select
          value={selectedRole}
          onChange={(e) =>
            setSelectedRole(e.target.value)
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        >
          <option value="client">
            Client
          </option>

          <option value="realtor">
            Realtor
          </option>
        </select>

        {message && (
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
            {message}
          </div>
        )}

        <button
          onClick={shareReport}
          disabled={loading}
          className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {loading
            ? "Sharing..."
            : "Share Report"}
        </button>
      </div>
    </div>
  );
}