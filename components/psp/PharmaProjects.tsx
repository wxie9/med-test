"use client";
import Link from "next/link";
import type { PharmaProjectsView, PharmaProjectView, AllowedMembers } from "@/lib/psp/pharmaView";
import { usePspState } from "@/lib/client/usePspState";
import { ProjectDetails, buttonClass } from "./Common";
function Members({ members }: { members: AllowedMembers }) { return <p className="text-sm font-medium">当前允许汇总人数：{members.status === "available" ? `${members.value} 人` : members.reason}</p>; }
export function PharmaProjects({ projectId }: { projectId?: string }) {
  const state = usePspState<PharmaProjectsView | PharmaProjectView>(projectId ? `/api/pharma/projects/${encodeURIComponent(projectId)}` : "/api/pharma/projects");
  if (!state.data) return <div className="space-y-3"><h1 className="text-xl font-semibold">患者支持服务项目</h1><p role="status">{state.notice || "正在加载项目…"}</p>{state.notice && <button className={buttonClass} onClick={() => void state.refresh()}>重新加载</button>}</div>;
  const items = "projects" in state.data ? state.data.projects : [{ project: state.data.project, allowedMembers: state.data.allowedMembers }];
  return <div className="space-y-6"><h1 className="text-xl font-semibold">{projectId ? "项目概览" : "患者支持服务项目"}</h1><p className="text-sm text-gray-600">模拟药企A身份 · 仅展示经授权且通过小样本保护的汇总信息</p>{state.notice && <p role="status">{state.notice}</p>}{items.length === 0 && <p>当前没有可展示的项目。</p>}{items.map(({ project, allowedMembers }) => <section key={project.id} className="space-y-4 rounded-lg border border-gray-200 p-4"><h2 className="font-semibold">{projectId ? project.title : <Link className="text-pink-700 underline" href={`/pharma/projects/${project.id}`}>{project.title}</Link>}</h2><ProjectDetails project={project} /><Members members={allowedMembers} />{projectId && <div className="border-t border-gray-200 pt-4"><h3 className="font-semibold">项目报告</h3><p className="mt-2 text-sm text-gray-600">暂无报告。第一阶段完成项目与授权入口，月度统计和报告将在后续阶段开放。</p></div>}</section>)}</div>;
}
