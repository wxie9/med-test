/** Bordered white card with a heading, used across research pages. */
export function ResearchCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ui-panel ${className}`}>
      <h2 className="panel-heading mb-4">{title}</h2>
      {children}
    </section>
  );
}
export function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ui-panel">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-gray-400">{note}</p>}
    </div>
  );
}
