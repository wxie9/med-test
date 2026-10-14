"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProResponse } from "@/lib/domain/types";
import { compareTimestamps, shanghaiCalendarDay } from "@/lib/domain/dates";
const COLORS = ["#db2777", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];
/** Item scores (0–3) across PRO submissions, one line per item. */
export function ProTrend({ pro }: { pro: ProResponse[] }) {
  if (!pro.length) return <p className="text-sm text-gray-400">暂无 PRO 记录</p>;
  const sorted = [...pro].sort((a, b) => compareTimestamps(a.submittedAt, b.submittedAt));
  const items = [...new Set(sorted.flatMap(r => Object.keys(r.items)))];
  const data = sorted.map(r => ({ date: shanghaiCalendarDay(r.submittedAt), ...r.items }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {items.map((k, i) => <Line key={k} type="linear" dataKey={k} name={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
