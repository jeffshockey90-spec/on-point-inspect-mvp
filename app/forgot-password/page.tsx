"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const cleanedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.resetPasswordForEmail(cleanedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--fl-ground)] p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[440px] w-[600px] -translate-x-1/2 rounded-full bg-teal-500/20 blur-[140px]" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[380px] w-[440px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(20,200,210,0.10),transparent_55%)]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[var(--fl-surface-2)] p-8 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex justify-center">
          <img
            src="/flow-logo-mark.png"
            alt="FLOW"
            className="h-28 w-auto drop-shadow-[0_0_34px_rgba(20,200,210,0.28)]"
          />
        </div>

        <p className="mt-3 text-center text-lg font-semibold text-[var(--fl-text)]">
          Reset your password
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-teal-800 bg-teal-950 p-3 text-sm text-[var(--fl-accent-text)]">
              If an account exists for {cleanedEmailDisplay(email)}, we&apos;ve sent a
              password reset link. Check your inbox (and spam folder).
            </div>

            <p className="text-center text-sm text-[var(--fl-muted)]">
              <a
                href="/login"
                className="text-[var(--fl-accent-text)] hover:underline"
              >
                Back to sign in
              </a>
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
          >
            <p className="text-sm text-[var(--fl-muted)]">
              Enter the email address on your account and we&apos;ll send you a
              link to reset your password.
            </p>

            <div>
              <label className="text-sm text-[var(--fl-muted)]">
                Email
              </label>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3.5 text-[var(--fl-text)] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {message && (
              <div className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-b from-teal-400 to-teal-500 px-4 py-3.5 font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-300 hover:to-teal-400 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <p className="text-center text-sm text-[var(--fl-muted)]">
              <a
                href="/login"
                className="text-[var(--fl-accent-text)] hover:underline"
              >
                Back to sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function cleanedEmailDisplay(email: string) {
  return email.trim().toLowerCase() || "that address";
}
