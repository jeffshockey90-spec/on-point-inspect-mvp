"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getRedirectAfterLogin() {
    try {
      const response = await fetch("/api/account-routing", {
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.authenticated) {
        if (payload?.dashboardHref) return payload.dashboardHref;
        if (payload?.isRealtor && !payload?.isInspector) return "/realtor-portal";
      }
    } catch (error) {
      console.error("Login routing check failed:", error);
    }

    return "/dashboard";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const redirectTo = await getRedirectAfterLogin();

    router.push(redirectTo === "/dashboard" ? "/dashboard" : redirectTo);
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050816] p-6">
      {/* Ambient brand glow */}
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

        <p className="mt-3 text-center text-sm font-bold uppercase tracking-[0.22em] text-slate-300">
          Capture. <span className="text-teal-400">Organize.</span> Complete.
        </p>

        <p className="mt-3 text-center text-sm text-slate-400">
          Inspector, Client, and Realtor access
        </p>

        <form onSubmit={handleLogin} className="mt-7 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Email
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Password
            </label>

            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
            />

            <div className="mt-2 text-right">
              <a
                href="/forgot-password"
                className="text-sm font-semibold text-teal-400 hover:underline"
              >
                Forgot password?
              </a>
            </div>
          </div>

          {message && (
            <div className="rounded-xl border border-red-800 bg-red-950/80 p-3 text-sm text-red-300">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-b from-teal-400 to-teal-500 px-4 py-3.5 font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-300 hover:to-teal-400 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <p className="text-center text-sm text-slate-400">
            Need an account?{" "}
            <a href="/signup" className="font-semibold text-teal-400 hover:underline">
              Create one
            </a>
          </p>
        </form>
      </div>

      <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-slate-600">
        Secure inspection management for modern home inspectors
      </p>
    </main>
  );
}
