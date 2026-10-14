import type { AssignmentSummary, ProjectSummary } from "@/lib/psp/views";
export const ENROLLMENT_LABEL = { invited: "待加入", active: "服务中", paused: "已暂停", exited: "已退出" };
export const formatPspTime = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
export const buttonClass = "rounded border border-pink-600 px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-50 disabled:opacity-50 disabled:cursor-not-allowed";
export function ProjectDetails({ project }: { project: ProjectSummary }) {
  return <div className="space-y-2 text-sm text-gray-700"><p>{project.sponsor} · 虚构项目 · 合成数据</p><p>{project.scope} · {project.population}</p><p>项目期间：{formatPspTime(project.startsAt)} — {formatPspTime(project.endsAt)}</p><p>阶段：{project.period} · 数据截止：{formatPspTime(project.cutoffAt)}</p><p>联系目标（模拟自然小时）：高 {project.contactTargets.high} 小时 / 中 {project.contactTargets.medium} 小时</p></div>;
}
export function Plans({ assignments }: { assignments: AssignmentSummary[] }) {
  return assignments.length ? <ul className="divide-y divide-gray-200 text-sm">{assignments.map(item => <li key={item.id} className="space-y-1 py-2"><p className="font-medium">{item.title}</p><p className="text-gray-600">固定截止：{formatPspTime(item.dueAt)}</p><p>{item.status === "completed" ? "已完成（合成背景记录） · 计划只读" : !item.actionable ? "服务暂停 · 计划只读" : item.kind === "questionnaire" ? "未提交 · 项目问卷填写将在后续阶段开放" : "待完成 · 本阶段仅展示固定计划"}</p></li>)}</ul> : <p className="text-sm text-gray-600">尚未建立服务计划，加入后由服务团队确认激活。</p>;
}
export function Feedback({ notice, busy, canRetry, retry }: { notice: string | null; busy: boolean; canRetry: boolean; retry: () => void }) {
  return <>{busy && <p role="status" className="py-2 text-sm">正在保存…</p>}{notice && <p role="status" className="py-2 text-sm text-gray-700">{notice}</p>}{canRetry && <button className={buttonClass} onClick={retry}>重试同一次操作</button>}</>;
}
