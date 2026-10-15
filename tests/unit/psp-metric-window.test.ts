import {afterEach,expect,it} from 'vitest';
import {buildPspTestStore} from '../helpers/psp';
import {createMetricWindow} from '@/lib/psp/metricWindow';
import type {MetricOptions} from '@/lib/psp/metricTypes';
import type {PspState,PspAssignment} from '@/lib/psp/types';
const at=(day:number,hour=0)=>`2026-10-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00+08:00`;
const opts=(s:PspState,changes:Partial<MetricOptions>={}):MetricOptions=>({projectId:s.project.id,periodStart:at(1),periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:at(13,10),scope:'internal',ledgerRevision:s.ledgerRevision,...changes});
const plan=(s:PspState)=>s.assignments.find(a=>a.enrollmentId==='ENR-01'&&a.kind==='contact')!;
function pause(s:PspState,time:string){const sequence=++s.ledgerRevision;s.membershipEvents.push({id:`window-pause:${sequence}`,enrollmentId:'ENR-01',status:'paused',reason:'合成暂停',occurredAt:time,recordedAt:time,actorId:'case-manager-chen',sequence});s.enrollments[0].status='paused';}
function cancel(s:PspState,time:string,recordedAt=time){const sequence=++s.ledgerRevision;(s.assignmentCancellations??=[]).push({id:`window-cancel:${sequence}`,projectId:s.project.id,enrollmentId:'ENR-01',assignmentId:plan(s).id,reason:'合成取消',occurredAt:time,recordedAt,actorId:'case-manager-chen',sequence});plan(s).status='cancelled';}
const originalTz=process.env.TZ;afterEach(()=>{if(originalTz===undefined)delete process.env.TZ;else process.env.TZ=originalTz;});
it('uses historical intervals for period membership and exact due times rather than current materialized state',()=>{
 const s=buildPspTestStore().psp;pause(s,at(10));const w=createMetricWindow(s,opts(s));expect(s.enrollments.filter(e=>w.periodMember(e.id))).toHaveLength(18);expect(w.qualifiedAt('ENR-01',at(13,10))).toBe(false);expect(w.dueApplicable(plan(s))).toBe(true);expect(w.qualifiedAt('ENR-02',at(13,10))).toBe(true);
});
it('normalizes equivalent offsets, is independent of host timezone and separates business interval from late booking cutoff',()=>{
 const s=buildPspTestStore().psp;for(const tz of ['UTC','Pacific/Honolulu','Asia/Shanghai']){process.env.TZ=tz;const w=createMetricWindow(s,opts(s));expect(w.options.periodStart).toBe('2026-09-30T16:00:00.000Z');expect(w.inWindow(at(13,10))).toBe(true);expect(w.inWindow(at(13,11))).toBe(false);expect(w.inWindow('2026-11-01T00:00:00+08:00')).toBe(false);expect(w.known(at(13,10),s.ledgerRevision)).toBe(true);expect(w.known(at(13,11),1)).toBe(false);}const w=createMetricWindow(s,opts(s,{periodEnd:at(12),cutoffAt:at(13,10)}));expect(w.inWindow(at(11))).toBe(true);expect(w.inWindow(at(12))).toBe(false);expect(w.known(at(13,9),s.ledgerRevision)).toBe(true);
});
it('first aggregate grant and same-clock later sequence never retrospectively authorize an earlier source',()=>{
 const s=buildPspTestStore().psp,prior=s.ledgerRevision,sequence=++s.ledgerRevision;s.permissionEvents.push({id:'late-aggregate',enrollmentId:'ENR-15',scope:'aggregate',action:'grant',textVersion:'psp-consent-v1',occurredAt:at(13,10),recordedAt:at(13,10),actorId:'P-0032',sequence});const w=createMetricWindow(s,opts(s,{scope:'aggregate'}));expect(w.qualifiedAt('ENR-15',at(13,10),prior)).toBe(false);expect(w.qualifiedAt('ENR-15',at(13,10),sequence)).toBe(true);expect(w.qualifiedAt('ENR-15',at(12),sequence)).toBe(false);expect(w.scopeSourceRefs('ENR-15')).toContain('late-aggregate');
});
it('an uncancelled responsibility survives inactivity at due, but explicit known timely inapplicable cancellation excludes it',()=>{
 const s=buildPspTestStore().psp;pause(s,at(7));const before=createMetricWindow(s,opts(s));expect(before.dueApplicable(plan(s))).toBe(true);cancel(s,at(7,1));expect(createMetricWindow(s,opts(s)).dueApplicable(plan(s))).toBe(false);expect(createMetricWindow(s,opts(s,{ledgerRevision:s.ledgerRevision-1})).dueApplicable(plan(s))).toBe(true);
});
it('late cancellation, active-at-due cancellation, and unproved materialized cancelled status cannot erase overdue responsibility',()=>{
 const a=buildPspTestStore().psp;pause(a,at(9));cancel(a,at(9,1));expect(createMetricWindow(a,opts(a)).dueApplicable(plan(a))).toBe(true);
 const b=buildPspTestStore().psp;cancel(b,at(7));expect(createMetricWindow(b,opts(b)).dueApplicable(plan(b))).toBe(true);
 const c=buildPspTestStore().psp;pause(c,at(7));plan(c).status='cancelled';expect(createMetricWindow(c,opts(c)).dueApplicable(plan(c))).toBe(true);
 const d=buildPspTestStore().psp;pause(d,at(7));cancel(d,at(7,1),at(14));expect(createMetricWindow(d,opts(d)).dueApplicable(plan(d))).toBe(true);
});
it('dynamic creation must be known by both time and sequence; typed parent facts can prove older followup creation',()=>{
 const s=buildPspTestStore().psp,sequence=++s.ledgerRevision,a:PspAssignment={...plan(s),id:'dynamic-known',assignedAt:at(13,10),dueAt:at(13,10),assignedRecordedAt:at(13,10),assignedSequence:sequence};s.assignments.push(a);expect(createMetricWindow(s,opts(s,{ledgerRevision:sequence-1})).assignmentKnown(a)).toBe(false);expect(createMetricWindow(s,opts(s)).dueApplicable(a)).toBe(true);
 const absent={...a,id:'dynamic-missing',assignedRecordedAt:undefined,assignedSequence:undefined};expect(createMetricWindow(s,opts(s)).assignmentKnown(absent)).toBe(false);
 (s.alertActions??=[]).push({id:'typed-parent',projectId:s.project.id,enrollmentId:'ENR-01',alertId:'synthetic-alert',action:'close',occurredAt:a.assignedAt,recordedAt:a.assignedAt,actorId:'doctor-zhang',sequence,followupAssignmentId:absent.id});expect(createMetricWindow(s,opts(s)).assignmentKnown(absent)).toBe(true);
 expect(createMetricWindow(s,opts(s,{ledgerRevision:sequence-1})).assignmentKnown(absent)).toBe(false);expect(createMetricWindow(s,opts(s)).assignmentKnown({...a,assignedRecordedAt:at(14)})).toBe(false);
});
it('scope authority is evaluated at due and never substituted with current aggregate grant',()=>{
 const s=buildPspTestStore().psp,sequence=++s.ledgerRevision;s.permissionEvents.push({id:'withdraw-aggregate',enrollmentId:'ENR-01',scope:'aggregate',action:'withdraw',textVersion:'psp-consent-v1',occurredAt:at(7),recordedAt:at(7),actorId:'P-A',sequence});expect(createMetricWindow(s,opts(s)).dueApplicable(plan(s))).toBe(true);expect(createMetricWindow(s,opts(s,{scope:'aggregate'})).dueApplicable(plan(s))).toBe(false);expect(createMetricWindow(s,opts(s,{scope:'aggregate'})).periodMember('ENR-01')).toBe(true);
});
it('rejects foreign project, invalid window/scope and a ledger version not available in the state',()=>{
 const s=buildPspTestStore().psp;for(const changes of [{projectId:'other'},{periodEnd:at(1)},{periodStart:'invalid'},{cutoffAt:'2026-09-01T00:00:00Z'},{ledgerRevision:s.ledgerRevision+1},{ledgerRevision:-1},{scope:'other' as 'internal'}])expect(()=>createMetricWindow(s,opts(s,changes))).toThrow();
});
it('same-clock service withdrawal cannot erase the seed plan birth or a qualified sequence at the report start',()=>{
 const s=buildPspTestStore().psp,sequence=++s.ledgerRevision;s.permissionEvents.push({id:'midnight-withdraw',enrollmentId:'ENR-01',scope:'service',action:'withdraw',textVersion:'psp-consent-v1',occurredAt:s.project.startsAt,recordedAt:s.project.startsAt,actorId:'P-A',sequence});pause(s,s.project.startsAt);
 const w=createMetricWindow(s,opts(s));expect(w.assignmentKnown(plan(s))).toBe(true);expect(w.dueApplicable(plan(s))).toBe(true);expect(w.periodMember('ENR-01')).toBe(true);expect(w.qualifiedAt('ENR-01',opts(s).cutoffAt)).toBe(false);
});
it('requires precise timezone-aware input instead of interpreting local strings using the host timezone',()=>{
 const s=buildPspTestStore().psp;expect(()=>createMetricWindow(s,opts(s,{periodStart:'2026-10-01T00:00:00'}))).toThrow();expect(()=>createMetricWindow(s,opts(s,{cutoffAt:'2026-10-13'}))).toThrow();
});
