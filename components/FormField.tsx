export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 text-sm font-medium text-[#e8ecf3]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full rounded-lg border border-white/10 bg-white p-3 text-slate-900 outline-none focus:ring-2 focus:ring-onpoint-teal";
export const darkInputClass = "w-full rounded-lg border border-white/10 bg-white/95 p-3 text-slate-900 outline-none focus:ring-2 focus:ring-onpoint-teal";
