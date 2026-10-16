"use client";
import Link from "next/link";
import type {PharmaProjectsView, PharmaProjectView, AllowedMembers} from "@/lib/psp/pharmaView";
import {usePspState} from "@/lib/client/usePspState";
import {ProjectDetails, buttonClass} from "./Common";
import {PharmaProjectOverview} from "./PharmaProjectOverview";

function Members({members}: {members: AllowedMembers}) {
  return <p className="text-sm font-medium">当前允许汇总人数：{members.status === "available" ? `${members.value} 人` : members.reason}</p>;
}

export function PharmaProjects({projectId}: {projectId?: string}) {
  const state = usePspState<PharmaProjectsView | PharmaProjectView>(projectId
    ? `/api/pharma/projects/${encodeURIComponent(projectId)}` : "/api/pharma/projects", 10000, true);
  const data = state.data;
  if (!data) return <div className="space-y-3">
    <h1 className="text-xl font-semibold">患者支持服务项目</h1>
    <p role="status">{state.notice || "正在加载项目…"}</p>
    {state.notice && <button type="button" className={buttonClass} onClick={() => void state.refresh()}>重新加载</button>}
  </div>;
  return <div className="min-w-0 space-y-6">
    <h1 className="text-xl font-semibold">{projectId ? "项目概览" : "患者支持服务项目"}</h1>
    <p className="text-sm text-gray-700">模拟药企A身份 · 仅展示经授权且通过小样本保护的汇总信息</p>
    <button type="button" className={buttonClass} onClick={() => void state.refresh()}>刷新项目与授权</button>
    {state.notice && <p role="status">{state.notice}</p>}
    {"reports" in data ? <PharmaProjectOverview view={data}/> : <>
      {data.projects.length === 0 && <p>当前没有可展示的项目。</p>}
      {data.projects.map(({project, allowedMembers}) => <section key={project.id} className="ui-panel space-y-5">
        <h2 className="font-semibold"><Link className="text-pink-700 underline" href={`/pharma/projects/${encodeURIComponent(project.id)}`}>{project.title}</Link></h2>
        <ProjectDetails project={project}/>
        <Link className={`${buttonClass} inline-block`} href={`/clinic/projects/${encodeURIComponent(project.id)}/services`}>切换到院内服务演示</Link>
        <Members members={allowedMembers}/>
      </section>)}
    </>}
  </div>;
}
