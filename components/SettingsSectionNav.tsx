"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "notifications", label: "Notifications" },
  { id: "company-profile", label: "Company Profile" },
  { id: "payments", label: "Payments" },
  { id: "public-profile", label: "Public Profile" },
  { id: "standards-of-practice", label: "Standards of Practice" },
  { id: "time-location", label: "Time & Location" },
  { id: "delete-account", label: "Delete Account" },
];

export default function SettingsSectionNav() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );

    if (elements.length === 0) return;

    function updateActive() {
      const threshold = 140;
      let current = elements[0].id;

      for (const el of elements) {
        if (el.getBoundingClientRect().top <= threshold) {
          current = el.id;
        }
      }

      setActiveId(current);
    }

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => window.removeEventListener("scroll", updateActive);
  }, []);

  return (
    <nav className="sticky top-8 hidden max-h-[calc(100vh-4rem)] w-full shrink-0 overflow-y-auto lg:block">
      <ul className="space-y-1 border-l border-slate-800 pl-4">
        {SECTIONS.map((section) => {
          const active = section.id === activeId;

          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={`block rounded-lg px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "bg-teal-500/10 text-teal-300"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
