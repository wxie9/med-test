import { getStore } from "@/lib/state/store";
import { now, newId, isOffHours } from "@/lib/state/clock";
import { evaluatePro } from "@/lib/alerts/rules";
import { transition } from "@/lib/alerts/machine";
import type { Alert, ProResponse } from "@/lib/domain/types";
export function submitPro(input: { patientId: string; scaleId: ProResponse["scaleId"]; items: Record<string, number>; flags: ProResponse["flags"] }) {
  const s = getStore(); const p = s.patients.get(input.patientId); if (!p) throw new Error("patient not found");
  const at = now(); const pro: ProResponse = { id: newId("pro"), scaleId: input.scaleId, submittedAt: at, items: input.items, flags: input.flags };
  p.pro.push(pro);
  const alerts: Alert[] = evaluatePro(p, pro).map(a => transition({ ...a, id: newId("alert"), status: "triggered", assignee: null, timestamps: { triggered: at }, notes: [] }, "assign", "system", at));
  s.alerts.push(...alerts);
  const offHours = isOffHours(at);
  const emergency = offHours && alerts.some(a => a.level === "high");
  let feedback = "已收到您的问卷，本次未发现需要处理的情况，请按计划继续随访。";
  if (alerts.length) {
    feedback = emergency ? "当前为非服务时段。若症状加重请前往急诊，值班电话 021-0000-0000（演示）。个案管理师将在下一个工作日联系您。" : "已收到您的报告，个案管理师将在 1 个工作日内联系您。";
    s.messages.push({ id: newId("msg"), patientId: p.id, kind: emergency ? "emergency" : "alert_feedback", at, text: feedback });
  }
  return { proId: pro.id, alerts, offHours, feedback };
}
