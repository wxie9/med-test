import { addDays } from "@/lib/domain/dates";
import type { Patient } from "@/lib/domain/types";
/** Last 60 days ending `today`: green = taken, red = missed, grey = no record. */
export function AdherenceCalendar({ logs, today }: { logs: Patient["adherence"]; today: string }) {
  const byDate = new Map(logs.map(l => [l.date, l]));
  const days = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59));
  return (
    <div>
      <div className="grid grid-cols-10 gap-1">
        {days.map(d => {
          const l = byDate.get(d);
          const cls = !l ? "bg-gray-100" : l.taken >= l.due ? "bg-green-400" : "bg-red-400";
          return <div key={d} title={`${d}${l ? (l.taken >= l.due ? " 已服" : ` 漏服${l.missedReason ? `（${l.missedReason}）` : ""}`) : " 无记录"}`} className={`aspect-square rounded ${cls} ${d === today ? "ring-2 ring-pink-600" : ""}`} />;
        })}
      </div>
      <p className="mt-2 flex gap-3 text-xs text-gray-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-green-400" />已服</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-red-400" />漏服</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-gray-200" />无记录</span>
      </p>
    </div>
  );
}
