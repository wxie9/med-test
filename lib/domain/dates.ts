export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
/** Compare timestamp instants even when one record uses Z and another uses +08:00. */
export const compareTimestamps = (a: string, b: string) => Date.parse(a) - Date.parse(b);
const shanghaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
/** Date-only records stay literal; timestamps use the clinic's Shanghai calendar. */
export function shanghaiCalendarDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parts = shanghaiDate.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDate(d);
};
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000);
