"use client";
import { useState } from "react";
import type { PatientMessage } from "@/lib/domain/types";
/** One research_opportunity message with a simulated "预约门诊" action (nothing is sent anywhere). */
export function ResearchOpportunity({ m }: { m: PatientMessage }) {
  const [booked, setBooked] = useState(false);
  return (
    <li className="rounded-lg border border-purple-100 bg-purple-50/40 p-3 text-sm">
      <p className="mb-1 text-xs text-gray-400">{new Date(m.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p>
      <p className="text-gray-800">{m.text}</p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={booked} onClick={() => setBooked(true)} className="rounded bg-pink-600 px-3 py-1 text-xs font-semibold text-white hover:bg-pink-700 disabled:opacity-50">预约门诊</button>
        <span className="text-[11px] text-gray-400">[模拟]</span>
        {booked && <span role="status" className="text-xs text-green-700">已提交预约申请（演示）</span>}
      </div>
    </li>
  );
}
