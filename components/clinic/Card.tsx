/** Bordered white card with a heading, used across clinic pages. */
export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}
