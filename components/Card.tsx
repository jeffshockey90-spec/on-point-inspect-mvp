export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-onpoint-panel p-5 shadow-lg">
      <h2 className="mb-4 text-lg font-semibold text-onpoint-teal">{title}</h2>
      {children}
    </section>
  );
}
