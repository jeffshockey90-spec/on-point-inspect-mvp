"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";
import { COUNTRIES, BUSINESS_LANGUAGES, defaultLanguageForCountry } from "../../lib/locale";

const ALLOWED_ROLES = ["inspector", "client", "realtor"];

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("inspector");
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState("en");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const cleanedEmail = email.trim().toLowerCase();
    const cleanedName = fullName.trim();
    const cleanedBusinessName = businessName.trim();

    if (!cleanedName) {
      setMessage("Please enter your full name.");
      setLoading(false);
      return;
    }

    if (!ALLOWED_ROLES.includes(role)) {
      setMessage("Please select a valid account type.");
      setLoading(false);
      return;
    }

    if (role === "inspector" && !cleanedBusinessName) {
      setMessage("Please enter your business name.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    let signUpData;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          data: {
            full_name: cleanedName,
            role,
            business_name: cleanedBusinessName,
          },
        },
      });

      if (error) {
        setMessage(error.message || "We couldn't create your account.");
        setLoading(false);
        return;
      }

      signUpData = data;
    } catch (err: any) {
      setMessage(
        err?.message ||
          "We couldn't reach the sign-up service. Please try again."
      );
      setLoading(false);
      return;
    }

    const userId = signUpData?.user?.id;

    // Finalize the account server-side (service role). This creates the
    // profile for every role, and a company + owner membership for
    // inspectors, so it works even before the email is confirmed (no
    // session yet, which would block a client-side write via RLS).
    if (userId) {
      try {
        const finalizeRes = await fetch("/api/signup-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            email: cleanedEmail,
            fullName: cleanedName,
            role,
            businessName: cleanedBusinessName,
            country,
            language,
          }),
        });

        const finalizeData = await finalizeRes.json().catch(() => null);

        if (!finalizeRes.ok) {
          const detail =
            typeof finalizeData?.error === "string"
              ? finalizeData.error
              : finalizeData?.error?.message;
          setMessage(
            detail ||
              "Your account was created, but setup didn't finish. Please contact support."
          );
          setLoading(false);
          return;
        }
      } catch (err: any) {
        setMessage(
          err?.message ||
            "Your account was created, but setup didn't finish. Please contact support."
        );
        setLoading(false);
        return;
      }
    }

    setMessage("Account created successfully. Redirecting to sign in...");

    setLoading(false);

    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  const isSuccess = /success/i.test(message);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--fl-ground)] p-6">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[440px] w-[600px] -translate-x-1/2 rounded-full bg-teal-500/20 blur-[140px]" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[380px] w-[440px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(20,200,210,0.10),transparent_55%)]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[var(--fl-surface-2)] p-8 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--fl-text)]">
          Create <span className="text-[var(--fl-accent-text)]">Account</span>
        </h1>

        <p className="mt-2 text-sm text-[var(--fl-muted)]">
          Inspector, Client, and Realtor access for reports and repair requests.
        </p>

        <form onSubmit={handleSignup} className="mt-7 space-y-4">
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
          />

          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
          />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="inspector">Inspector</option>
            <option value="client">Client</option>
            <option value="realtor">Realtor</option>
          </select>

          {role === "inspector" && (
            <>
              <input
                required
                placeholder="Business name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">Country</span>
                  <select
                    value={country}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCountry(next);
                      // Helpfully default the report language to the country's
                      // primary language; the inspector can still change it.
                      setLanguage(defaultLanguageForCountry(next));
                    }}
                    className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">Report language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  >
                    {BUSINESS_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
          />

          <input
            required
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
          />

          {message && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                isSuccess
                  ? "border-emerald-700 bg-emerald-500/10 text-[var(--fl-good-text)]"
                  : "border-red-800 bg-red-500/10 text-[var(--fl-crit-text)]"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-b from-teal-400 to-teal-500 px-4 py-3.5 font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-300 hover:to-teal-400 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-[var(--fl-muted)]">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-[var(--fl-accent-text)] hover:underline">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
