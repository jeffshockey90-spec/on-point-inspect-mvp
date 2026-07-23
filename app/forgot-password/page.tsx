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
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex justify-center">
          <img
            src="/flow-logo-mark.png"
            alt="FLOW"
            className="h-32 w-auto"
          />
        </div>

        <p className="mt-3 text-center text-lg font-semibold text-white">
          Reset your password
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-teal-800 bg-teal-950 p-3 text-sm text-teal-300">
              If an account exists for {cleanedEmailDisplay(email)}, we&apos;ve sent a
              password reset link. Check your inbox (and spam folder).
            </div>

            <p className="text-center text-sm text-slate-400">
              <a
                href="/login"
                className="text-teal-400 hover:underline"
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
            <p className="text-sm text-slate-400">
              Enter the email address on your account and we&apos;ll send you a
              link to reset your password.
            </p>

            <div>
              <label className="text-sm text-slate-300">
                Email
              </label>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <p className="text-center text-sm text-slate-400">
              <a
                href="/login"
                className="text-teal-400 hover:underline"
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
