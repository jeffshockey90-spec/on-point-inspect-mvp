"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

// Renders the copy-paste <iframe> snippet an inspector drops on their own
// website to embed the booking form. The snippet includes a resize listener
// that pairs with EmbedAutoHeight so the iframe grows to fit the form.
export default function BookingEmbedSnippet({
  slug,
  siteUrl,
}: {
  slug: string;
  siteUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!slug) {
    return (
      <p className="text-sm text-[var(--fl-muted)]">
        Save a profile slug above first — your booking embed code is generated from it.
      </p>
    );
  }

  const base = (siteUrl || "").replace(/\/$/, "");
  const src = `${base}/embed/book?inspector=${encodeURIComponent(slug)}`;
  const snippet =
    `<iframe src="${src}" title="Book an inspection" style="width:100%;border:0;min-height:640px"></iframe>\n` +
    `<script>window.addEventListener("message",function(e){if(e&&e.data&&e.data.type==="flow-embed-height"){var f=document.querySelector('iframe[src*="/embed/book"]');if(f){f.style.height=e.data.height+"px";}}});</script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; user can still select the text */
    }
  }

  return (
    <div>
      <textarea
        readOnly
        value={snippet}
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 font-mono text-xs leading-5 text-[var(--fl-muted)]"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy embed code"}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--fl-line)] px-4 py-2.5 text-sm font-semibold text-[var(--fl-text)] transition hover:border-cyan-400 hover:text-cyan-300"
        >
          <ExternalLink className="h-4 w-4" />
          Preview
        </a>
      </div>
    </div>
  );
}
