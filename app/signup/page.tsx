"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

const ALLOWED_ROLES = [
  "inspector",
  "client",
  "realtor",
];

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("inspector");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignup(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const cleanedEmail = email
      .trim()
      .toLowerCase();

    const cleanedName = fullName.trim();

    if (!cleanedName) {
      setMessage(
        "Please enter your full name."
      );
      setLoading(false);
      return;
    }

    if (!ALLOWED_ROLES.includes(role)) {
      setMessage(
        "Please select a valid account type."
      );
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage(
        "Password must be at least 6 characters."
      );
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { data, error } =
      await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          data: {
            full_name: cleanedName,
            role,
          },
        },
      });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;

    if (userId) {
      const { error: profileError } =
        await supabase
          .from("profiles")
          .upsert({
            id: userId,
            full_name: cleanedName,
            email: cleanedEmail,
            role,
            updated_at:
              new Date().toISOString(),
          });

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }
    }

    setMessage(
      "Account created successfully."
    );

    setLoading(false);

    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h1 className="text-3xl font-bold text-teal-400">
          Create Account
        </h1>

        <p className="mt-2 text-slate-400">
          Inspector, Client, and Realtor
          access for reports and repair
          requests.
        </p>

        <form
          onSubmit={handleSignup}
          className="mt-6 space-y-4"
        >
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) =>
              setFullName(e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          >
            <option value="inspector">
              Inspector
            </option>

            <option value="client">
              Client
            </option>

            <option value="realtor">
              Realtor
            </option>
          </select>

          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          <input
            required
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(
                e.target.value
              )
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          {message && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create Account"}
          </button>

          <p className="text-center text-sm text-slate-400">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-teal-400 hover:underline"
            >
              Sign in
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}