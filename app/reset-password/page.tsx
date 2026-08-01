"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true;
        setReady(true);
      } else if (!settled) {
        const timeout = setTimeout(() => {
          if (!settled) setInvalidLink(true);
        }, 2500);
        return () => clearTimeout(timeout);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050816] p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[440px] w-[600px] -translate-x-1/2 rounded-full bg-teal-500/20 blur-[140px]" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[380px] w-[440px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(20,200,210,0.10),transparent_55%)]" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex justify-center">
          <img
            src="/flow-logo-mark.png"
            alt="FLOW"
            className="h-28 w-auto drop-shadow-[0_0_34px_rgba(20,200,210,0.28)]"
          />
        </div>

        <p className="mt-3 text-center text-lg font-semibold text-white">
          Set a new password
        </p>

        {invalidLink ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
              This reset link is invalid or has expired.
            </div>

            <a
              href="/forgot-password"
              className="block w-full rounded-lg bg-teal-500 px-4 py-3 text-center font-semibold text-slate-950 transition hover:bg-teal-400"
            >
              Request a new link
            </a>
          </div>
        ) : success ? (
          <div className="mt-6 rounded-lg border border-teal-800 bg-teal-950 p-3 text-center text-sm text-teal-300">
            Password updated. Redirecting...
          </div>
        ) : !ready ? (
          <p className="mt-6 text-center text-sm text-slate-400">
            Verifying your reset link...
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="text-sm text-slate-300">
                New Password
              </label>

              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="text-sm text-slate-300">
                Confirm Password
              </label>

              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {message && (
              <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-b from-teal-400 to-teal-500 px-4 py-3.5 font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-300 hover:to-teal-400 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Saving..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
