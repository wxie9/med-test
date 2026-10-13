import type { Patient } from "@/lib/domain/types";
import { buildTimeline, type TimelineItem, type LaneKey } from "@/lib/clinic/timeline";
const TONE: Record<TimelineItem["tone"], string> = {
  primary: "bg-sky-500", metastatic_specimen: "bg-violet-600", staging: "bg-gray-600",
  neoadjuvant: "bg-amber-500", adjuvant: "bg-blue-500", metastatic: "bg-rose-600", outcome: "bg-red-700", pro: "bg-emerald-500",
};
const ROW_H: Record<LaneKey, number> = { specimen: 46, staging: 34, treatment: 34, outcome: 34, pro: 22 };
const LEGEND: { tone: TimelineItem["tone"]; label: string }[] = [
  { tone: "neoadjuvant", label: "新辅助" }, { tone: "adjuvant", label: "辅助" }, { tone: "metastatic", label: "解救（Lx = 治疗线）" },
  { tone: "primary", label: "原发灶标本" }, { tone: "metastatic_specimen", label: "转移灶标本" }, { tone: "outcome", label: "结局事件" }, { tone: "pro", label: "PRO 提交" },
];
function Item({ it, lane }: { it: TimelineItem; lane: LaneKey }) {
  const top = it.row * ROW_H[lane];
  if (lane === "pro") return <span title={it.detail} className={`absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full ${TONE[it.tone]}`} style={{ left: `${it.left}%`, top: top + 6 }} />;
  const textPos = it.alignRight ? { right: `${100 - it.left - it.width}%` } : { left: `${it.left}%` };
  return (
    <div title={it.detail}>
      {it.width > 0
        ? <span className={`absolute h-2.5 rounded-sm ${TONE[it.tone]}`} style={{ left: `${it.left}%`, width: `${it.width}%`, top: top + 4, minWidth: 4 }} />
        : <span className={`absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 ${TONE[it.tone]}`} style={{ left: `${it.left}%`, top: top + 4 }} />}
      <span className={`absolute whitespace-nowrap text-xs leading-4 ${it.alignRight ? "text-right" : ""}`} style={{ ...textPos, top: top + 16 }}>
        <span className="font-medium text-gray-800">{it.title}</span>
        {lane === "specimen" && <span className="block text-gray-600">{it.detail}</span>}
      </span>
    </div>
  );
}
/** Horizontal patient timeline: one swim lane per event family on a shared date axis (first event → today). */
export function Timeline({ patient, today }: { patient: Patient; today: string }) {
  const m = buildTimeline(patient, today);
  return (
    <div>
      <div className="grid grid-cols-[6.5rem_1fr] text-sm">
        {m.lanes.map(l => (
          <div key={l.key} className="contents">
            <div className="border-t border-gray-100 py-1 pr-2 text-xs font-medium text-gray-500">{l.label}</div>
            <div className="relative mr-2 border-t border-gray-100" style={{ height: l.rows * ROW_H[l.key] + 6 }} data-lane={l.key}>
              {m.ticks.map(t => <span key={t.date} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${t.left}%` }} />)}
              <span className="absolute top-0 bottom-0 right-0 w-px bg-pink-300" />
              {l.items.length === 0 && <span className="absolute left-0 top-1 text-xs text-gray-300">无记录</span>}
              {l.items.map(it => <Item key={it.id} it={it} lane={l.key} />)}
            </div>
          </div>
        ))}
        <div />
        <div className="relative mr-2 h-5 border-t border-gray-300 text-[11px] text-gray-500">
          {m.ticks.map(t => <span key={t.date} className="absolute top-1 -translate-x-1/2" style={{ left: `${t.left}%` }}>{t.label}</span>)}
          <span className="absolute top-1 right-0 text-pink-600">今天 {m.end}</span>
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
        {LEGEND.map(g => <span key={g.tone}><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${TONE[g.tone]}`} />{g.label}</span>)}
      </p>
    </div>
  );
}
