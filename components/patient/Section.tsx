/** White card with a heading, used across patient pages. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-3 my-3 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}
