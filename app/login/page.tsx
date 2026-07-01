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
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h1 className="text-3xl font-bold text-teal-400">
          On Point Login
        </h1>

        <p className="mt-2 text-slate-400">
          Inspector, Client, and Realtor Access
        </p>

        <form
          onSubmit={handleLogin}
          className="mt-6 space-y-4"
        >
          <div>
            <label className="text-sm text-slate-300">
              Email
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">
              Password
            </label>

            <input
              type="password"
              required
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
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
            className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
          >
            {loading
              ? "Signing In..."
              : "Sign In"}
          </button>

          <p className="text-center text-sm text-slate-400">
            Need an account?{" "}
            <a
              href="/signup"
              className="text-teal-400 hover:underline"
            >
              Create one
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
