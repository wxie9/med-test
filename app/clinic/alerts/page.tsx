"use client";
import { useDemoState } from "@/lib/client/useDemoState";
import { AlertQueue } from "@/components/AlertQueue";
import { AlertMetricsCards } from "@/components/clinic/AlertMetricsCards";
import type { Alert } from "@/lib/domain/types";
type LiteState = { alerts: Alert[]; serverNow: string };
export default function AlertsPage() {
  const { data, error, refresh } = useDemoState<LiteState>(3000);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">预警队列</h1>
      <AlertMetricsCards alerts={data.alerts} nowIso={data.serverNow} />
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <AlertQueue alerts={data.alerts} today={data.serverNow.slice(0, 10)} onChanged={refresh} />
      </section>
    </div>
  );
}
