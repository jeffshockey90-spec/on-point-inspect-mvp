"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type Bounce = { recipient: string; subject: string | null; when: string | null };

/**
 * Red banner shown on an inspection when an email to it bounced (bad address).
 * Auto-clears once the address is fixed: when `currentEmails` is provided, only
 * bounces to an address that's STILL a current recipient are shown.
 */
export default function EmailDeliveryAlert({
  inspectionId,
  currentEmails = [],
}: {
  inspectionId: string | number;
  currentEmails?: (string | null | undefined)[];
}) {
  const [bounces, setBounces] = useState<Bounce[]>([]);

  const currentKey = currentEmails
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    const id = String(inspectionId || "").trim();
    if (!id) return;
    let active = true;

    fetch(`/api/email-health?inspection=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const list: Bounce[] = data.byInspection?.[id] || [];
        const current = new Set(currentKey.split(",").filter(Boolean));
        const relevant = current.size ? list.filter((b) => current.has(b.recipient)) : list;
        setBounces(relevant);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [inspectionId, currentKey]);

  if (!bounces.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-red-500/50 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fl-crit-text)]" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-[var(--fl-crit-text)]">
            {bounces.length === 1 ? "An email bounced — the address may be wrong" : "Emails bounced — an address may be wrong"}
          </p>
          <p className="mt-1 leading-6 text-[var(--fl-crit-text)]/80">
            We couldn&apos;t deliver to{" "}
            {bounces.map((b, i) => (
              <span key={b.recipient}>
                {i > 0 ? ", " : ""}
                <span className="font-bold text-[var(--fl-text)]">{b.recipient}</span>
              </span>
            ))}
            {" "}(recipient not found). Double-check the address, update it on this inspection, and resend — the delivery service blocks repeat sends to a bad address until it&apos;s corrected.
          </p>
        </div>
      </div>
    </div>
  );
}
