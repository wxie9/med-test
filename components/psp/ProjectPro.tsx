'use client';
import Link from 'next/link';
import { Section } from '@/components/patient/Section';
import { usePspState } from '@/lib/client/usePspState';
import type { ProResponse } from '@/lib/domain/types';
import type { PatientProjectsView } from '@/lib/psp/views';
import { ProjectProForm } from './ProjectProForm';
import { buttonClass, formatPspTime, planTitle } from './Common';
export function ProjectPro({ patientId, assignmentId, revisionOf, onSubmitted, revisionResponse, clinicalReady, clinicalError, retryClinical }: { patientId: string; assignmentId: string; revisionOf?: string; onSubmitted: () => void; revisionResponse?: ProResponse; clinicalReady: boolean; clinicalError: Error | null; retryClinical: () => void }) {
 const state = usePspState<PatientProjectsView>(`/api/psp/patients/${encodeURIComponent(patientId)}/projects?role=patient&actorId=${encodeURIComponent(patientId)}`);
 const own = state.data?.patientId === patientId ? state.data : null;
 const member = own?.projects.find(item => item.assignments.some(assignment => assignment.id === assignmentId && assignment.kind === 'questionnaire'));
 const assignment = member?.assignments.find(item => item.id === assignmentId && item.kind === 'questionnaire');
 return <Section title="项目症状与用药问卷">
  {state.readError && state.data && <><p role="status" className="text-sm text-gray-700">{state.notice ?? '项目计划暂时不可用，请重新加载。'}</p><button className={buttonClass} onClick={() => void state.refresh()}>重新加载项目计划</button></>}
  {!state.data ? <><p role="status" className="text-sm text-gray-700">{state.notice ?? '正在核对当前患者的项目计划…'}</p>{state.notice && <button className={buttonClass} onClick={() => void state.refresh()}>重新加载项目计划</button>}</> : !own || !member || !assignment ? <p role="alert" className="text-sm text-red-700">当前患者的计划中不存在此项目问卷，请从自己的固定计划进入。</p> : <>
   {!state.readError && <><Link href={`/patient/plan?patient=${encodeURIComponent(own.patientId)}#assignment-${encodeURIComponent(assignment.id)}`} className="mb-3 inline-block text-sm text-pink-700 underline">返回固定计划</Link>
   <div className="mb-4 space-y-1 border-b border-gray-200 pb-3 text-sm text-gray-800"><p>当前患者：{own.displayName} · {patientId}</p><h3 className="font-semibold">{member.project.title}</h3><p>{planTitle(assignment)}</p><p>固定截止：{formatPspTime(assignment.dueAt)}</p><p className="text-xs text-gray-600">虚构项目 · 合成数据 · 联系目标（模拟自然小时）：高 {member.project.contactTargets.high} 小时 / 中 {member.project.contactTargets.medium} 小时</p><button type="button" className={`${buttonClass} mt-2`} onClick={() => void state.refresh()}>刷新计划</button></div></>}
   <ProjectProForm readAvailable={!state.readError} initialResponse={revisionResponse} clinicalReady={clinicalReady} clinicalError={clinicalError} retryClinical={retryClinical} key={`${patientId}:${assignmentId}:${own.seedVersion}:${revisionOf ?? ''}:${revisionResponse?.id ?? ''}`} patientId={patientId} assignment={assignment} seedVersion={own.seedVersion} revisionOf={revisionOf} allowed={member.enrollment.status === 'active' && member.permissions.service && Date.parse(own.serverNow) >= Date.parse(member.project.startsAt) && Date.parse(own.serverNow) <= Date.parse(member.project.endsAt)} onSubmitted={() => { onSubmitted(); void state.refresh(); }} refresh={state.refresh} />
  </>}
 </Section>;
}
