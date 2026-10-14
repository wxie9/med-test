'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SCALE_SYMPTOMS } from '@/lib/pro/scales';
import { useProjectProSubmission } from '@/lib/client/useProjectProSubmission';
import type { ProResponse } from '@/lib/domain/types';
import type { AssignmentSummary } from '@/lib/psp/views';
import { buttonClass, formatPspTime } from './Common';
const LEVELS = ['无', '轻度', '中度', '重度'];
export function ProjectProForm({ patientId, assignment, seedVersion, revisionOf, allowed, onSubmitted, refresh, initialResponse, clinicalReady, clinicalError, retryClinical }: { patientId: string; assignment: AssignmentSummary; seedVersion: number; revisionOf?: string; allowed: boolean; onSubmitted: () => void; refresh: () => void | Promise<void>; initialResponse?: ProResponse; clinicalReady: boolean; clinicalError: Error | null; retryClinical: () => void }) {
 const [items, setItems] = useState<Record<string, number>>(() => Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s => [s, initialResponse?.items[s] ?? 0])));
 const [missedDoses14d, setMissed] = useState(initialResponse?.flags.missedDoses14d ?? 0), [stopIntent, setStop] = useState(initialResponse?.flags.stopIntent ?? false);
 const submission = useProjectProSubmission({ patientId, assignmentId: assignment.id, seedVersion, expectedVersion: assignment.version, revisionOf }, onSubmitted, refresh);
 const completed = assignment.status === 'completed';
 const reviseHref = `/patient/pro?assignment=${encodeURIComponent(assignment.id)}&patient=${encodeURIComponent(patientId)}&revisionOf=${encodeURIComponent(assignment.latestValidResponseId ?? '')}`;
 const completion = assignment.firstValidSubmittedAt;
 const editable = (!revisionOf || !!initialResponse) && allowed && ((assignment.status === 'open' && assignment.actionable) || (completed && !!revisionOf && revisionOf === assignment.latestValidResponseId));
 if (revisionOf && !clinicalReady && clinicalError) return <div className="space-y-3"><p role="alert" className="text-sm text-red-700">上次项目答卷读取失败，请重试读取答卷后再修订。</p><button type="button" className={buttonClass} onClick={retryClinical}>重试读取答卷</button></div>;
 if (revisionOf && !clinicalReady) return <p role="status" className="text-sm text-gray-700">正在读取当前计划的最新答卷…</p>;
 if (revisionOf && revisionOf === assignment.latestValidResponseId && !initialResponse && !submission.result) return <div className="space-y-3"><p role="alert" className="text-sm text-red-700">无法读取此计划的最新答卷，请重试读取答卷并核对计划。</p><button type="button" className={buttonClass} onClick={retryClinical}>重试读取答卷</button></div>;
 return <div className="space-y-3">
  {completion && <p data-testid="project-pro-completion" className="text-sm text-gray-800">已完成 · {Date.parse(completion) <= Date.parse(assignment.dueAt) ? '按时' : '迟交'} · 首次有效提交：{formatPspTime(completion)}</p>}
  {revisionOf && !submission.result && !submission.busy && !submission.canRetry && (revisionOf !== assignment.latestValidResponseId || !completed) ? <p role="alert" className="text-sm text-red-700">修订目标已变化，请返回计划核对最新答卷。</p> : <>
   {allowed && !completed && !assignment.actionable && !submission.result && <p className="text-sm text-gray-700">此问卷计划当前不可填写，请核对固定计划状态。</p>}
   {!allowed && !submission.result && <p className="text-sm text-gray-700">当前项目服务未激活或未授权，问卷只读。</p>}
   {allowed && completed && !revisionOf && !submission.result && assignment.latestValidResponseId && <Link href={reviseHref} className={`${buttonClass} inline-block`}>修订项目问卷</Link>}
   {(editable || submission.busy || submission.canRetry || submission.result) && <>
    {revisionOf && <p className="text-sm text-gray-700">修订上次项目答卷{initialResponse?.submittedAt ? `（${formatPspTime(initialResponse.submittedAt)}）` : ""}。已载入该答卷；修订将创建新答卷，首次完成时间和固定截止保持不变。</p>}
    <p className="text-xs text-amber-800">演示用自拟问卷，非标准量表。0 = 无，3 = 重度。</p>
    <form onSubmit={event => { event.preventDefault(); if (editable) submission.submit({ items, flags: { missedDoses14d, stopIntent } }); }} className="space-y-4">
     <fieldset disabled={submission.locked || !editable} className="space-y-4">
      {SCALE_SYMPTOMS.endocrine_monthly_v1.map(symptom => <label key={symptom} className="block"><span className="flex justify-between text-sm text-gray-800"><span>{symptom}</span><span className="text-gray-600">{items[symptom]} · {LEVELS[items[symptom]]}</span></span><input aria-label={symptom} data-testid={`slider-${symptom}`} type="range" min={0} max={3} step={1} value={items[symptom]} disabled={submission.locked || !editable} onChange={event => setItems(previous => ({ ...previous, [symptom]: Number(event.target.value) }))} className="w-full accent-pink-600" /></label>)}
      <label className="flex items-center justify-between gap-2 text-sm text-gray-800">过去两周漏服次数<input data-testid="missed-doses" type="number" min={0} max={14} value={missedDoses14d} onChange={event => setMissed(Math.max(0, Math.min(14, Math.trunc(Number(event.target.value) || 0))))} className="w-20 rounded border border-gray-300 px-2 py-1 text-right" /></label>
      <label className="flex items-center justify-between text-sm text-gray-800">是否有停药念头<input data-testid="stop-intent" type="checkbox" checked={stopIntent} onChange={event => setStop(event.target.checked)} className="h-5 w-5 accent-pink-600" /></label>
      <button type="submit" data-testid="submit-project-pro" className="w-full rounded-lg bg-pink-600 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">{submission.busy ? '提交中…' : revisionOf ? '提交修订答卷' : '提交项目问卷'}</button>
     </fieldset>
    </form>
   </>}
   {submission.notice && <p role="alert" className="text-sm text-gray-800">{submission.notice}</p>}
   {submission.canRetry && <button type="button" className={buttonClass} onClick={submission.retry}>重试同一次提交</button>}
   {submission.reviewRequired && <button type="button" className={buttonClass} onClick={submission.acknowledge}>已核对当前计划，继续填写</button>}
   {submission.result && <div role="status" className={`rounded-lg p-3 text-sm ${submission.result.data.emergency ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}><p data-testid="project-pro-feedback">{submission.result.data.feedback}</p><p className="mt-2">首次有效提交：{formatPspTime(submission.result.data.firstValidSubmittedAt)} · {submission.result.data.onTime ? '按时' : '迟交'}</p><Link href="/patient/messages" className="mt-2 inline-block underline">查看消息</Link><Link href={`/patient/plan?patient=${encodeURIComponent(patientId)}`} className="ml-3 inline-block underline">返回固定计划</Link>{allowed && assignment.latestValidResponseId && <Link href={reviseHref} className="mt-2 block underline">修订项目问卷</Link>}</div>}
  </>}
 </div>;
}
