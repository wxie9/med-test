"use client";
import Link from "next/link";
import { usePspState } from "@/lib/client/usePspState";
import type { PatientProjectsView } from "@/lib/psp/views";
import { buttonClass, formatPspTime } from "./Common";
/** Uses the patient summary; never fetches or opens individual unsent assignments. */
export function PatientEducationLinks({ patientId }: { patientId: string }) {
 const state = usePspState<PatientProjectsView>(`/api/psp/patients/${encodeURIComponent(patientId)}/projects?role=patient&actorId=${encodeURIComponent(patientId)}`);
 const sent = state.data?.projects.flatMap(project => (project.education ?? []).filter(e => e.sentAt)) ?? [];
 return <section data-testid="psp-message-education" className="mx-3 my-3 rounded-xl border border-gray-200 bg-white p-3"><h2 className="font-semibold">服务团队发送的教育资料</h2>{state.notice ? <><p role="status" className="my-2 text-sm">{state.notice}</p><button className={buttonClass} onClick={() => void state.refresh()}>重新加载资料列表</button></> : !state.data ? <p className="py-2 text-sm text-gray-600">正在加载已发送资料…</p> : sent.length ? <ul className="divide-y divide-gray-100 text-sm">{sent.map(item => <li key={item.assignmentId} className="space-y-1 py-2"><p>{item.title}</p><p className="text-gray-600">{item.background ? "合成背景发送" : "已发送"} · {formatPspTime(item.sentAt!)}</p><Link className={`${buttonClass} inline-block`} href={`/patient/education/${encodeURIComponent(item.assignmentId)}?patient=${encodeURIComponent(patientId)}`}>阅读教育资料</Link></li>)}</ul> : <p className="py-2 text-sm text-gray-600">暂无已发送的教育资料。</p>}</section>;
}
