"use client";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
const COLORS = ["#db2777", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#94a3b8"];
/** Distribution of missed-dose reasons (one count per under-taken adherence record). */
export function MissedReasonPie({ dist }: { dist: Record<string, number> }) {
  const data = Object.entries(dist).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (!data.length) return <p className="text-sm text-gray-400">无漏服记录</p>;
  return (
    <div className="h-72 w-full" data-testid="missed-reason-pie">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius="65%" label={({ name, value }) => `${name} ${value}`} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} 次`, "漏服记录"]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
