export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDate(d);
};
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000);
