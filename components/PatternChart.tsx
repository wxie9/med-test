"use client";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
/** Horizontal bars of the most frequent treatment-line sequences (top 10 by count). */
export function PatternChart({ sequences, top = 10 }: { sequences: { path: string; count: number }[]; top?: number }) {
  const data = [...sequences].sort((a, b) => b.count - a.count).slice(0, top);
  if (!data.length) return <p className="text-sm text-gray-400">无治疗线记录</p>;
  return (
    <div className="w-full" style={{ height: data.length * 34 + 40 }} data-testid="pattern-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="path" width={300} tick={{ fontSize: 12 }} interval={0} />
          <Tooltip formatter={(v: number) => [`${v} 例`, "患者数"]} />
          <Bar dataKey="count" fill="#db2777" isAnimationActive={false}>
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#374151" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
