/** White card with a heading, used across patient pages. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="patient-section">
      <h2 className="mb-2 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}
