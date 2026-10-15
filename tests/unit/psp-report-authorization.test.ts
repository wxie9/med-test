import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft} from '@/lib/psp/reports';
import {snapshotAggregateUsability} from '@/lib/psp/snapshotAuthorization';
import {recordPermission,recordEnrollmentState} from '@/lib/psp/permissions';
import {proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
import {recordInteraction} from '@/lib/psp/contact';
import {submitProjectPro} from '@/lib/psp/commands';
import {importLegacySelfReports,submitProjectAdherence} from '@/lib/psp/selfReport';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import type {PspServiceSnapshot} from '@/lib/psp/snapshotTypes';
import type {CommandMeta} from '@/lib/psp/types';
const projectId='PSP-BC-ENDO-001',start='2026-10-01T00:00:00+08:00',end='2026-11-01T00:00:00+08:00';
const meta=(id:string,overrides:Partial<CommandMeta>={}):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,actorId:'project-manager-psp',role:'project_manager',...overrides});
const freeze=(id='freeze',periodStart=start)=>freezePspSnapshot(projectId,{periodStart,periodEnd:end,cutoffAt:process.env.DEMO_FIXED_NOW!},meta(id)).data;
const permission=(action:'grant'|'withdraw',id='ENR-01',scope:'aggregate'|'service'='aggregate')=>{const e=getStore().psp.enrollments.find(e=>e.id===id)!;return recordPermission(id,scope,action,meta(`${scope}-${action}-${getStore().psp.ledgerRevision}`,{role:'patient',actorId:e.patientId,expectedVersion:e.version}));};
// Narrow to an actual frozen evidence family to prove its own mapping, then test full commands separately.
const family=(s:PspServiceSnapshot,key:string)=>({...s,evidence:s.evidence.filter(e=>e.scope==='aggregate'&&e.metricKey===key)});
const usable=(s:PspServiceSnapshot)=>snapshotAggregateUsability(s,getStore().psp,process.env.DEMO_FIXED_NOW!).usable;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('ignores withdrawal by an internal-only member and unrelated authorizationVersion updates',()=>{
 const s=freeze(),internal=getStore().psp.enrollments.find(e=>!getStore().psp.permissionEvents.some(p=>p.enrollmentId===e.id&&p.scope==='aggregate'&&p.action==='grant'))!;
 expect(s.sources.some(source=>source.value.enrollmentId===internal.id)).toBe(true);permission('withdraw',internal.id);
 const e=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;recordEnrollmentState(e.id,{state:e.status,reason:'核验适用性',eligibilityConfirmed:true},meta('doctor',{role:'doctor',actorId:'doctor-zhang',expectedVersion:e.version}));
 expect(usable(s)).toBe(true);expect(createReportDraft(s.id,{nextActions:[]},meta('allowed')).data.status).toBe('draft');
});
it('uses permission-only period-members roots and unused denominator/cutoff cohorts',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';const s=freeze();
 expect(family(s,'period_members').evidence[0].sourceRefs.every(ref=>['membership','permission'].includes(s.sources.find(x=>x.ref===ref)!.kind))).toBe(true);
 expect(family(s,'contact_early_completed').evidence[0].sourceRefs).toEqual([]);expect(family(s,'contact_early_completed').evidence[0].cohortRefs.length).toBe(14);
 permission('withdraw');expect(usable(family(s,'period_members'))).toBe(false);expect(usable(family(s,'contact_early_completed'))).toBe(false);
});
it('supports a new window entirely after regrant, despite earlier revoked support history',()=>{
 permission('withdraw');permission('grant');process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';
 const s=freeze('new-range','2026-10-14T00:00:00+08:00');
 expect(s.sources.some(x=>x.kind==='permission'&&x.value.action==='withdraw')).toBe(true);expect(usable(s)).toBe(true);
 expect(createReportDraft(s.id,{nextActions:[]},meta('new-range-draft')).data.revision).toBe(1);
});
it('blocks a withdrawn due denominator even when its questionnaire completion is zero',()=>{
 const s=freeze();expect(s.aggregateMetrics.find(m=>m.key==='questionnaire_completion')).toMatchObject({numerator:0,denominator:14});permission('withdraw');expect(usable(family(s,'questionnaire_completion'))).toBe(false);
});
it('uses early historical_result exact same-clock sequence rather than current regrant',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';const a=getStore().psp.assignments.find(a=>a.id===`${projectId}:ENR-01:CONTACT:2026-10`)!;
 const result=recordInteraction({enrollmentId:a.enrollmentId,assignmentId:a.id,channel:'phone',outcome:'reached',alertIds:[]},meta('call',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:a.version})).data;
 permission('withdraw');const s=freeze();expect(family(s,'contact_early_completed').evidence[0].cohortQualifications.find(q=>q.ref===a.id)).toEqual({ref:a.id,basis:'historical_result',sourceRef:result.id});
 permission('grant');expect(usable(family(s,'contact_early_completed'))).toBe(false);expect(()=>createReportDraft(s.id,{nextActions:[]},meta('blocked'))).toThrow();
});
it.each([false,true])('preserves unknown legacy-gap witness, with withdrawal=%s',(withdraw)=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:false}},meta('pro',{role:'patient',actorId:'P-A',expectedVersion:1}));
 if(withdraw)permission('withdraw');const old=structuredClone(getStore());delete old.psp.questionnaireEvidence;installPspTestStore(old);const s=freeze();
 expect(s.aggregateMetrics.find(m=>m.key==='questionnaire_early_completed')?.status).toBe('unknown');expect(family(s,'questionnaire_early_completed').evidence[0].cohortQualifications.some(q=>q.basis===(withdraw?'legacy_gap':'cutoff_grant'))).toBe(true);
 expect(usable(family(s,'questionnaire_early_completed'))).toBe(!withdraw);if(!withdraw)expect(createReportDraft(s.id,{nextActions:[]},meta('unknown')).data.content.chapters.flatMap(c=>c.facts).some(f=>f.status==='unknown')).toBe(true);
});
it('date-only self-report checks the historical Shanghai day, not a later import grant',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-05T02:00:00.000Z';permission('withdraw');permission('grant');process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 const e=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;importLegacySelfReports(e.id,meta('import',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:e.version}));const s=freeze();
 const roots=family(s,'self_report_ratio').evidence[0].sourceRefs.map(ref=>s.sources.find(source=>source.ref===ref)!).filter(s=>s.kind==='selfReport');expect(roots.some(s=>s.value.precision==='date_only'&&String(s.value.logDate)<'2026-10-05')).toBe(true);expect(usable(family(s,'self_report_ratio'))).toBe(false);
});
it('midnight withdrawal/regrant belongs to the new date-only interval without poisoning its support',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-04T16:00:00.000Z';permission('withdraw');permission('grant');process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 const e=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;importLegacySelfReports(e.id,meta('import',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:e.version}));const s=freeze('midnight','2026-10-05T00:00:00+08:00');
 expect(family(s,'self_report_ratio').evidence[0].sourceRefs.some(ref=>s.sources.find(s=>s.ref===ref)?.kind==='selfReport')).toBe(true);expect(usable(family(s,'self_report_ratio'))).toBe(true);
});
it('instant self-report revision only uses selected new grant; old revision is support',()=>{
 const e=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;const first=submitProjectAdherence({enrollmentId:e.id,due:1,taken:0},meta('first',{role:'patient',actorId:e.patientId,expectedVersion:e.version})).data;
 permission('withdraw');permission('grant');submitProjectAdherence({enrollmentId:e.id,due:1,taken:1,revisionOf:first.sourceId},meta('revised',{role:'patient',actorId:e.patientId,expectedVersion:getStore().psp.enrollments.find(x=>x.id===e.id)!.version}));const s=freeze();
 expect(family(s,'self_report_ratio').evidence[0].sourceRefs).not.toContain(first.sourceId);expect(family(s,'self_report_ratio').evidence[0].supportingRefs).toContain(first.sourceId);expect(usable(family(s,'self_report_ratio'))).toBe(true);expect(usable(s)).toBe(false);
});
it('ignores future withdrawals until both occurrence and recording are visible',()=>{
 const s=freeze();process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';permission('withdraw');process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;expect(usable(s)).toBe(true);process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';expect(usable(s)).toBe(false);
});
it('allows legitimate empty aggregate scope after all prior intervals fall outside the window',()=>{
 for(const e of getStore().psp.enrollments.filter(e=>getStore().psp.permissionEvents.some(p=>p.enrollmentId===e.id&&p.scope==='aggregate')))permission('withdraw',e.id);
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';const s=freeze('empty','2026-10-14T00:00:00+08:00');expect(s.aggregateMetrics.every(m=>m.sourceRefs.length===0)).toBe(true);expect(usable(s)).toBe(true);expect(createReportDraft(s.id,{nextActions:[]},meta('empty-report')).data.status).toBe('draft');
});

it('effective correction uses its fact sequence; original contact is only support',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';const a=getStore().psp.assignments.find(a=>a.id===`${projectId}:ENR-01:CONTACT:2026-10`)!;
 const call=recordInteraction({enrollmentId:a.enrollmentId,assignmentId:a.id,channel:'phone',outcome:'no_answer',alertIds:[]},meta('call',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:a.version})).data;
 permission('withdraw');permission('grant');const correction=proposeCorrection({sourceRef:{kind:'contact',id:call.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'核验结果',occurredAt:process.env.DEMO_FIXED_NOW!},meta('correction',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:getStore().psp.enrollments.find(e=>e.id===a.enrollmentId)!.version})).data;
 verifyCorrection(correction.id,meta('verify',{role:'data_reviewer',actorId:'data-reviewer-psp',expectedVersion:correction.version}));const s=freeze();expect(family(s,'interaction_successes').evidence[0].sourceRefs).toEqual(expect.arrayContaining([call.id,correction.id]));expect(usable(family(s,'interaction_successes'))).toBe(true);expect(usable(s)).toBe(false);
});
it('alert denominator cohort is checked even when the numerator has no direct source',()=>{
 submitProjectPro({assignmentId:`${projectId}:ENR-01:PRO:2026-10`,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},meta('pro',{role:'patient',actorId:'P-A',expectedVersion:1}));const s=freeze(),e=family(s,'alert_due_uncontacted').evidence[0];expect(e.sourceRefs).toEqual([]);expect(e.cohortRefs.length).toBeGreaterThan(0);permission('withdraw');expect(usable(family(s,'alert_due_uncontacted'))).toBe(false);
});
it('date-only log with an intraday same-clock withdrawal/regrant is not a contributed aggregate source',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-05T04:00:00.000Z';permission('withdraw');permission('grant');process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 const e=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;importLegacySelfReports(e.id,meta('import',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:e.version}));const s=freeze();
 expect(getStore().psp.selfReportRevisions?.some(r=>r.enrollmentId===e.id&&r.logDate==='2026-10-05')).toBe(true);
 expect(family(s,'self_report_ratio').evidence[0].sourceRefs.map(ref=>s.sources.find(x=>x.ref===ref)).some(x=>x?.kind==='selfReport'&&x.value.logDate==='2026-10-05')).toBe(false);
});
it('fails closed when a claimed aggregate contributor lacks a qualifying frozen grant',()=>{
 const s=freeze();for(const source of s.sources)if(source.kind==='permission'&&source.value.scope==='aggregate'&&source.value.enrollmentId==='ENR-01')source.value.action='withdraw';
 expect(usable(family(s,'period_members'))).toBe(false);expect(usable(family(s,'active_members'))).toBe(false);
});
