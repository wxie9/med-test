/** Bordered white card with a heading, used across clinic pages. */
export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ui-panel ${className}`}>
      <h2 className="panel-heading mb-4">{title}</h2>
      {children}
    </section>
  );
}
