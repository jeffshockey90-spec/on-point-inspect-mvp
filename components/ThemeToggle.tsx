"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "flow-theme";
type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}

// Light/dark switch. The DB (profiles.theme) is the source of truth so the
// choice follows the user across devices; localStorage is the no-flash cache
// that the inline script in layout.tsx reads before first paint. On mount we
// reconcile with the DB in case another device changed it.
export default function ThemeToggle({
  compact = false,
  variant,
}: {
  compact?: boolean;
  variant?: "full" | "compact" | "mobile";
}) {
  const mode = variant || (compact ? "compact" : "full");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());

    // Cross-device reconcile: pull the saved choice and apply if it differs.
    fetch("/api/settings/theme", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const saved = data?.theme;
        if ((saved === "light" || saved === "dark") && saved !== currentTheme()) {
          applyTheme(saved);
          setTheme(saved);
        }
      })
      .catch(() => {});
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
    fetch("/api/settings/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  const isLight = theme === "light";
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";

  if (mode === "mobile") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5 text-center text-[var(--fl-muted)] transition active:scale-[0.98] hover:text-[var(--fl-text)] [touch-action:manipulation]"
      >
        <span className="flex w-full items-center justify-center leading-none">
          {isLight ? <Moon className="h-5 w-5" strokeWidth={2} /> : <Sun className="h-5 w-5" strokeWidth={2} />}
        </span>
        <span className="mt-1 block w-full text-center text-[10px] font-semibold leading-none whitespace-nowrap">
          {isLight ? "Dark" : "Light"}
        </span>
      </button>
    );
  }

  if (mode === "compact") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-line)] text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-accent-line)] hover:text-[var(--fl-text)]"
      >
        {isLight ? <Moon className="h-4 w-4" strokeWidth={2} /> : <Sun className="h-4 w-4" strokeWidth={2} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--fl-line)] px-3 py-2 text-sm font-semibold text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-accent-line)] hover:text-[var(--fl-text)]"
    >
      {isLight ? <Moon className="h-4 w-4" strokeWidth={2} /> : <Sun className="h-4 w-4" strokeWidth={2} />}
      {isLight ? "Dark mode" : "Light mode"}
    </button>
  );
}
