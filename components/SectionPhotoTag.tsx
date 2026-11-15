import type { CSSProperties } from "react";

// Small pill in the top-left corner of a summary photo naming the finding's
// section (with its unit on multi-unit jobs), filled with the severity color.
export default function SectionPhotoTag({ label, style }: { label: string; style: CSSProperties }) {
  if (!label) return null;
  return (
    <span
      style={style}
      title={label}
      className="pointer-events-none absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded-full border border-white/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-md"
    >
      {label}
    </span>
  );
}
