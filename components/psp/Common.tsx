import Link from "next/link";
import type { AssignmentSummary, ProjectSummary } from "@/lib/psp/views";
export const ENROLLMENT_LABEL = { invited: "待加入", active: "服务中", paused: "已暂停", exited: "已退出" };
export const formatPspTime = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
export const buttonClass = "rounded border border-pink-600 px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-50 disabled:opacity-50 disabled:cursor-not-allowed";
export function ProjectDetails({ project }: { project: ProjectSummary }) {
  return <div className="space-y-2 text-sm text-gray-700"><p>{project.sponsor} · 虚构项目 · 合成数据</p><p>{project.scope} · {project.population}</p><p>项目期间：{formatPspTime(project.startsAt)} — {formatPspTime(project.endsAt)}</p><p>阶段：{project.period} · 数据截止：{formatPspTime(project.cutoffAt)}</p><p>联系目标（模拟自然小时）：高 {project.contactTargets.high} 小时 / 中 {project.contactTargets.medium} 小时</p></div>;
}
export const planTitle = (item: AssignmentSummary) => item.kind === "questionnaire" ? item.title.replace("（后续阶段开放）", "") : item.title;
export function Plans({ assignments, patientId, canSubmit = false, education }: { assignments: AssignmentSummary[]; patientId?: string; canSubmit?: boolean; education?: { assignmentId: string; sentAt: string | null }[] }) {
  return assignments.length ? <ul className="divide-y divide-gray-200 text-sm">{assignments.map(item => {
    const questionnaire = item.kind === "questionnaire";
    const completed = item.status === "completed";
    const sent = item.kind === "education" && education?.some(record => record.assignmentId === item.id && record.sentAt);
    const completion = (item.kind === "contact" || item.kind === "education") && item.completion && !item.completion.background ? `已完成${item.kind === "contact" ? "联系" : "教育反馈"} · ${formatPspTime(item.completion.at)}` : item.firstValidSubmittedAt ? `已完成 · ${Date.parse(item.firstValidSubmittedAt) <= Date.parse(item.dueAt) ? "按时" : "迟交"} · ${formatPspTime(item.firstValidSubmittedAt)}` : "已完成（合成背景记录） · 计划只读";
    const link = patientId && canSubmit && questionnaire && ((!completed && item.actionable) || (completed && item.latestValidResponseId));
    const href = `/patient/pro?assignment=${encodeURIComponent(item.id)}&patient=${encodeURIComponent(patientId ?? "")}${completed ? `&revisionOf=${encodeURIComponent(item.latestValidResponseId ?? "")}` : ""}`;
    return <li key={item.id} id={`assignment-${item.id}`} tabIndex={-1} className="scroll-mt-4 space-y-1 py-2"><p className="font-medium">{planTitle(item)}</p><p className="text-gray-600">固定截止：{formatPspTime(item.dueAt)}</p><p>{completed ? completion : !item.actionable ? "服务暂停 · 计划只读" : questionnaire ? "未提交" : item.kind === "contact" ? "待服务团队联系" : education === undefined ? "待教育服务完成" : sent ? "待阅读反馈" : "待发送教育资料"}</p>{sent && patientId && <Link href={`/patient/education/${encodeURIComponent(item.id)}?patient=${encodeURIComponent(patientId)}`} className={`${buttonClass} inline-block`}>阅读教育资料</Link>}{link && <Link href={href} className={`${buttonClass} inline-block`}>{completed ? "修订项目问卷" : "填写项目问卷"}</Link>}</li>;
  })}</ul> : <p className="text-sm text-gray-600">尚未建立服务计划，加入后由服务团队确认激活。</p>;
}
export function Feedback({ notice, busy, canRetry, retry }: { notice: string | null; busy: boolean; canRetry: boolean; retry: () => void }) {
  return <>{busy && <p role="status" className="py-2 text-sm">正在保存…</p>}{notice && <p role="status" className="py-2 text-sm text-gray-700">{notice}</p>}{canRetry && <button className={buttonClass} onClick={retry}>重试同一次操作</button>}</>;
}
