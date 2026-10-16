import {beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getInternalProjectView} from '@/lib/psp/views';
import {getStore} from '@/lib/state/store';
const projectId='PSP-BC-ENDO-001';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it('projects overdue questionnaires only for internal staff',()=>{
 const rows=getInternalProjectView(projectId,'case_manager','case-manager-chen').exceptions;
 expect(rows.some(r=>r.kind==='overdue_questionnaire'&&r.patientId==='P-A')).toBe(true);
 for(const role of ['patient','pharma_owner'])expect(()=>getInternalProjectView(projectId,role,'P-A')).toThrow();
});
it('uses strict deadline and excludes future assigned records',()=>{
 const s=getStore(),a=s.psp.assignments.find(a=>a.kind==='questionnaire'&&a.status==='open')!;
 a.dueAt=PSP_TEST_NOW;
 expect(getInternalProjectView(projectId,'doctor','doctor-zhang').exceptions.some(r=>r.id===`questionnaire:${a.id}`)).toBe(false);
 a.dueAt='2026-10-12T00:00:00Z';a.assignedRecordedAt='2026-10-14T00:00:00Z';
 expect(getInternalProjectView(projectId,'doctor','doctor-zhang').exceptions.some(r=>r.id===`questionnaire:${a.id}`)).toBe(false);
});
import {submitProjectPro} from '@/lib/psp/commands';
import {recordInteraction,actOnProjectAlert} from '@/lib/psp/contact';
import {sendEducation,recordEducationOpened,recordEducationFeedback} from '@/lib/psp/education';
import {recordPermission,recordEnrollmentState} from '@/lib/psp/permissions';
const rows=()=>getInternalProjectView(projectId,'case_manager','case-manager-chen').exceptions;
let request=0;
function meta(id:string,role:'patient'|'case_manager'|'doctor'='case_manager',actorId=role==='patient'?'P-A':role==='doctor'?'doctor-zhang':'case-manager-chen'){
 const s=getStore(),target=s.psp.assignments.find(a=>a.id===id)??s.psp.enrollments.find(e=>e.id===id)??s.alerts.find(a=>a.id===id)!;
 return {seedVersion:s.seedVersion,expectedVersion:target.version??1,clientRequestId:`queue-${++request}`,role,actorId};
}
function trigger(){const a=getStore().psp.assignments.find(a=>a.kind==='questionnaire'&&a.enrollmentId.endsWith('01'))!;submitProjectPro({assignmentId:a.id,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4}},meta(a.id,'patient'));return getStore().alerts.map(a=>a.id);}
it('deduplicates one failed interaction over two alerts, and only resolves explicitly reached targets',()=>{
 const ids=trigger(),e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordInteraction({enrollmentId:e.id,alertIds:ids,channel:'phone',outcome:'no_answer'},meta(e.id));
 expect(rows().filter(r=>r.kind==='failed_contact')).toHaveLength(1);expect(rows().find(r=>r.kind==='failed_contact')!.additionalTargets.map(t=>t.id)).toEqual(ids);
 recordInteraction({enrollmentId:e.id,alertIds:[ids[0]],channel:'phone',outcome:'reached'},meta(e.id));
 expect(rows().find(r=>r.kind==='failed_contact')!.additionalTargets.map(t=>t.id)).toEqual([ids[1]]);
 const c=getStore().psp.serviceEvents.find(c=>c.channel&&c.outcome==='reached')!;c.recordedAt='2026-10-14T00:00:00Z';
 expect(rows().find(r=>r.kind==='failed_contact')!.additionalTargets).toHaveLength(2);
});
it('requires original project disposition for pending review and never invents a review deadline',()=>{
 const ids=trigger(),id=ids[0],e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 const contact=recordInteraction({enrollmentId:e.id,alertIds:[id],channel:'phone',outcome:'reached'},meta(e.id));
 actOnProjectAlert(id,{action:'accept'},meta(id));actOnProjectAlert(id,{action:'start'},meta(id));
 actOnProjectAlert(id,{action:'submit_review',disposition:{category:'contacted',summary:'已联系',interactionIds:[contact.data.interactionId]}},meta(id));
 expect(rows().find(r=>r.kind==='pending_review')).toMatchObject({responsibleRole:'doctor',overdue:false});expect(rows().find(r=>r.kind==='pending_review')!.dueAt).toBeUndefined();
 actOnProjectAlert(id,{action:'close',note:'已核对',followupTask:{type:'复评',owner:'张医生',dueAt:'2026-10-20T00:00:00Z'}},meta(id,'doctor'));
 expect(rows().some(r=>r.kind==='pending_review')).toBe(false);expect(getStore().psp.assignments.some(a=>a.id.includes('REVIEW')&&a.status==='open')).toBe(true);
});
it('keeps education help separate from completed feedback until explicit followup contact',()=>{
 const a=getStore().psp.assignments.find(a=>a.kind==='education'&&a.enrollmentId.endsWith('01'))!;
 sendEducation(a.id,getStore().psp.educationContents[0].id,meta(a.id));recordEducationOpened(a.id,meta(a.id,'patient'));recordEducationFeedback(a.id,{understood:false,needsHelp:true},meta(a.id,'patient'));
 const help=rows().find(r=>r.kind==='education_help')!,followup=getStore().psp.assignments.find(a=>a.id===help.target.id)!;
 expect(followup.status).toBe('open');expect(help.overdue).toBe(false);
 recordInteraction({enrollmentId:a.enrollmentId,assignmentId:followup.id,alertIds:[],channel:'phone',outcome:'reached'},meta(followup.id));
 expect(rows().some(r=>r.kind==='education_help'&&r.patientId==='P-A')).toBe(false);expect(getStore().psp.educationResults.find(r=>r.assignmentId===a.id)!.understood).toBe(false);
});
it('keeps blocked obligations and permits internal service after aggregate-only withdrawal',()=>{
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordPermission(e.id,'aggregate','withdraw',meta(e.id,'patient'));expect(rows().find(r=>r.patientId==='P-A')!.blockedReason).toBeUndefined();
 recordPermission(e.id,'service','withdraw',meta(e.id,'patient'));expect(rows().find(r=>r.patientId==='P-A')!.blockedReason).toContain('服务授权已撤回');
 recordEnrollmentState(e.id,{state:'exited',reason:'测试退出'},meta(e.id));expect(rows().find(r=>r.patientId==='P-A')!.blockedReason).toContain('成员已退出');
 process.env.DEMO_FIXED_NOW='2027-01-01T00:00:00Z';expect(rows().find(r=>r.patientId==='P-A')!.blockedReason).toContain('不在项目服务期内');
});
it('shows unlinked historical help for verification and isolates return values',()=>{
 const s=getStore(),a=s.psp.assignments.find(a=>a.kind==='education'&&a.enrollmentId.endsWith('01'))!;
 s.psp.educationResults.push({assignmentId:a.id,contentVersionId:s.psp.educationContents[0].id,sentAt:a.assignedAt,openedAt:a.assignedAt,feedbackAt:a.assignedAt,understood:false,needsHelp:true,actorId:'P-A',sequence:1});
 const help=rows().find(r=>r.kind==='education_help'&&r.patientId==='P-A')!;expect(help.reason).toContain('需核对跟进记录');expect(help.blockedReason).toBeTruthy();expect(help.verificationTarget).toEqual(help.target);
 help.target.id='mutated';expect(rows().find(r=>r.id===help.id)!.target.id).toBe(a.id);
 expect(rows().every(r=>s.psp.enrollments.some(e=>e.patientId===r.patientId&&e.projectId===projectId))).toBe(true);
});
it('annotates corrections without converting original failed execution into completion',()=>{
 const ids=trigger(),e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 const contact=recordInteraction({enrollmentId:e.id,alertIds:ids,channel:'phone',outcome:'no_answer'},meta(e.id)).data;
 const s=getStore(),before=JSON.stringify(s.psp.assignments);
 s.psp.corrections=[{id:'correction',projectId,enrollmentId:e.id,sourceRef:{kind:'contact',id:contact.id},interactionId:contact.interactionId,alertIds:ids,sourceValue:{channel:'phone',outcome:'no_answer',occurredAt:PSP_TEST_NOW},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'补录核验',occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW,proposedBy:'case-manager-chen',sequence:++s.psp.ledgerRevision,version:1,status:'verified',verifiedAt:PSP_TEST_NOW,verifiedBy:'data-reviewer-a',verificationSequence:s.psp.ledgerRevision}];
 expect(rows().find(r=>r.kind==='failed_contact')).toMatchObject({correctionHref:`/governance/projects/${projectId}/corrections`});expect(rows().find(r=>r.kind==='failed_contact')!.reason).toContain('原执行记录');expect(JSON.stringify(s.psp.assignments)).toBe(before);
});
it('keeps cancelled help followup visible for verification and paused member obligations blocked',()=>{
 const a=getStore().psp.assignments.find(a=>a.kind==='education'&&a.enrollmentId.endsWith('01'))!;
 sendEducation(a.id,getStore().psp.educationContents[0].id,meta(a.id));recordEducationOpened(a.id,meta(a.id,'patient'));recordEducationFeedback(a.id,{understood:false,needsHelp:true},meta(a.id,'patient'));
 const help=rows().find(r=>r.kind==='education_help'&&r.patientId==='P-A')!;getStore().psp.assignments.find(a=>a.id===help.target.id)!.status='cancelled';
 expect(rows().find(r=>r.id===help.id)!.blockedReason).toContain('需核对');expect(rows().find(r=>r.id===help.id)!.verificationTarget).toEqual(help.target);
 getStore().psp.assignments.find(a=>a.id===help.target.id)!.status='paused';expect(rows().find(r=>r.id===help.id)!.verificationTarget).toEqual(help.target);
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;recordEnrollmentState(e.id,{state:'paused',reason:'暂停'},meta(e.id));expect(rows().filter(r=>r.patientId==='P-A').every(r=>!!r.blockedReason)).toBe(true);
});
it('orders attempts by occurrence before ledger order and excludes future evidence',()=>{
 const ids=trigger(),e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordInteraction({enrollmentId:e.id,alertIds:ids,channel:'phone',outcome:'no_answer'},meta(e.id));
 const c=getStore().psp.serviceEvents.find(c=>c.channel)!;
 getStore().psp.serviceEvents.push({...c,id:'backdated',interactionId:'backdated',outcome:'reached',occurredAt:'2026-10-12T00:00:00Z',sequence:++getStore().psp.ledgerRevision});
 expect(rows().find(r=>r.kind==='failed_contact')!.additionalTargets).toHaveLength(2);
 c.recordedAt='2026-10-14T00:00:00Z';expect(rows().some(r=>r.kind==='failed_contact')).toBe(false);
});

it.each(['occurredAt','recordedAt','sequence'] as const)('keeps questionnaire open until original completion %s is visible',field=>{
 const a=getStore().psp.assignments.find(a=>a.kind==='questionnaire'&&a.enrollmentId.endsWith('01'))!;
 trigger();
 getStore().psp.questionnaireEvidence=getStore().psp.questionnaireEvidence!.map(x=>({...x}));
 const evidence=getStore().psp.questionnaireEvidence!.find(x=>x.assignmentId===a.id)!;
 if(field==='sequence')evidence.sequence=getStore().psp.ledgerRevision+1;else evidence[field]='2026-10-14T00:00:00Z';
 expect(rows().some(r=>r.id===`questionnaire:${a.id}`)).toBe(true);
});
it.each(['recordedAt','sequence'] as const)('keeps education followup actionable when reached %s is future',field=>{
 const a=getStore().psp.assignments.find(a=>a.kind==='education'&&a.enrollmentId.endsWith('01'))!;
 sendEducation(a.id,getStore().psp.educationContents[0].id,meta(a.id));recordEducationOpened(a.id,meta(a.id,'patient'));recordEducationFeedback(a.id,{understood:false,needsHelp:true},meta(a.id,'patient'));
 const help=rows().find(r=>r.kind==='education_help'&&r.patientId==='P-A')!;
 recordInteraction({enrollmentId:a.enrollmentId,assignmentId:help.target.id,alertIds:[],channel:'phone',outcome:'reached'},meta(help.target.id));
 const event=getStore().psp.serviceEvents.find(x=>x.assignmentId===help.target.id&&x.outcome==='reached')!;
 if(field==='sequence')event.sequence=getStore().psp.ledgerRevision+1;else event.recordedAt='2026-10-14T00:00:00Z';
 expect(rows().find(r=>r.id===help.id)).toMatchObject({reason:expect.stringContaining('关联跟进尚未完成')});
 expect(rows().find(r=>r.id===help.id)!.blockedReason).toBeUndefined();
});
it('distinguishes each pending review using its actual alert kind and rule',()=>{
 const ids=trigger(),e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 const contact=recordInteraction({enrollmentId:e.id,alertIds:ids,channel:'phone',outcome:'reached'},meta(e.id));
 for(const id of ids){actOnProjectAlert(id,{action:'accept'},meta(id));actOnProjectAlert(id,{action:'start'},meta(id));actOnProjectAlert(id,{action:'submit_review',disposition:{category:'contacted',summary:'已联系',interactionIds:[contact.data.interactionId]}},meta(id));}
 const pending=rows().filter(r=>r.kind==='pending_review');expect(pending).toHaveLength(2);
 for(const row of pending){const alert=getStore().alerts.find(a=>a.id===row.target.id)!;expect(row.reason).toContain(alert.rule);expect(row.reason).toContain(alert.kind==='symptom'?'症状':'依从性');expect(row.dueAt).toBeUndefined();}
 expect(new Set(pending.map(row=>row.reason)).size).toBe(2);
});
