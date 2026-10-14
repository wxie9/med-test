/** Bordered white card with a heading, used across research pages. */
export function ResearchCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}
export function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-gray-400">{note}</p>}
    </div>
  );
}
