import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import * as clock from '@/lib/state/clock';
import {recordPermission} from '@/lib/psp/permissions';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import type {CommandMeta} from '@/lib/psp/types';
import * as commands from '@/lib/psp/commands';
const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
const input=()=>({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}});
const assignment=()=>getStore().psp.assignments.find(a=>a.id===assignmentId)!;
const meta=(id='first'):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:assignment().version,clientRequestId:id,actorId:'P-A',role:'patient'});
const submit=(body:commands.ProjectProInput=input(),m=meta())=>commands.submitProjectPro(body,m);
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{vi.restoreAllMocks();delete process.env.DEMO_FIXED_NOW;});
it('atomically records a late first completion with assignment CAS and preserves authorization version',()=>{
 const before=structuredClone(getStore()),r=submit();
 expect(r.data.alertIds).toHaveLength(2);expect(r.data.assignmentId).toBe(assignmentId);expect(r.data.firstValidSubmittedAt).toBe(PSP_TEST_NOW);expect(r.data.onTime).toBe(false);
 expect(assignment()).toMatchObject({status:'completed',version:2,firstValidSubmittedAt:PSP_TEST_NOW,latestValidResponseId:r.data.proId});
 expect(getStore().patients.get('P-A')!.pro).toHaveLength(before.patients.get('P-A')!.pro.length+1);
 expect(getStore().alerts).toHaveLength(before.alerts.length+2);expect(getStore().messages).toHaveLength(before.messages.length+1);
 expect(getStore().psp.enrollments).toEqual(before.psp.enrollments);expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
 expect(getStore().psp.assignments.filter(a=>a.firstValidSubmittedAt!==null)).toHaveLength(before.psp.assignments.filter(a=>a.firstValidSubmittedAt!==null).length+1);
 expect(getStore().psp.assignments.filter(a=>a.firstValidSubmittedAt && Date.parse(a.firstValidSubmittedAt)<=Date.parse(a.dueAt))).toHaveLength(before.psp.assignments.filter(a=>a.firstValidSubmittedAt && Date.parse(a.firstValidSubmittedAt)<=Date.parse(a.dueAt)).length);
});
it('replays lost response before CAS and service withdrawal without any new writes',()=>{
 const m=meta(),first=submit(input(),m);recordPermission('ENR-01','service','withdraw',{...m,expectedVersion:1,clientRequestId:'withdraw'});const before=structuredClone(getStore());
 expect(submit(input(),m)).toEqual(first);expect(getStore()).toEqual(before);
 expect(()=>submit(input(),{...meta('new')})).toThrow(/授权|成员/);
});
it('completed ordinary repeat records a receipt but no new clinical writes or assignment version',()=>{
 const first=submit(),before=structuredClone(getStore()),r=submit({...input(),items:{...input().items,关节痛:0}},meta('second'));
 expect(r.data).toEqual(first.data);expect(r.objectVersion).toBe(first.objectVersion);expect(getStore().patients).toEqual(before.patients);expect(getStore().alerts).toEqual(before.alerts);expect(getStore().messages).toEqual(before.messages);expect(getStore().psp.assignments).toEqual(before.psp.assignments);
});
it('explicit revision appends new clinical result, retains first completion and replays exactly',()=>{
 const first=submit();process.env.DEMO_FIXED_NOW='2026-10-13T04:00:00.000Z';
 const body={...input(),revisionOf:first.data.proId},m=meta('revision'),before=structuredClone(getStore()),r=submit(body,m);
 expect(r.data.proId).not.toBe(first.data.proId);expect(r.data.firstValidSubmittedAt).toBe(first.data.firstValidSubmittedAt);expect(assignment().latestValidResponseId).toBe(r.data.proId);expect(assignment().version).toBe(3);expect(getStore().alerts).toHaveLength(before.alerts.length+2);
 const revised=structuredClone(getStore());expect(submit(body,m)).toEqual(r);expect(getStore()).toEqual(revised);
 expect(()=>submit(body,meta('outdated-revision'))).toThrow(/修订/);
});
it('rejects incomplete or unknown items, wrong scale and invalid adherence flags without writing',()=>{
 const before=structuredClone(getStore());
 for(const body of [{...input(),items:{关节痛:3}},{...input(),items:{...input().items,未知:1}},{...input(),flags:{missedDoses14d:15}},{...input(),scaleId:'treatment_weekly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.treatment_weekly_v1.map(s=>[s,1])),flags:{}}])expect(()=>submit(body as ReturnType<typeof input>)).toThrow();
 expect(getStore()).toEqual(before);
});
it('rejects cross patient, missing, non-questionnaire, stale seed, stale version and reused body',()=>{
 const m=meta(),before=structuredClone(getStore());
 for(const [body,metadata] of [[{...input(),patientId:'P-0002'},m],[{...input(),assignmentId:'missing'},m],[{...input(),assignmentId:assignmentId.replace(':PRO:',':CONTACT:')},m],[input(),{...m,seedVersion:m.seedVersion+1}],[input(),{...m,expectedVersion:2}]])expect(()=>submit(body as ReturnType<typeof input>,metadata as CommandMeta)).toThrow();
 expect(getStore()).toEqual(before);submit(input(),m);
 expect(()=>submit({...input(),items:{...input().items,潮热:0}},m)).toThrow(/请求编号/);expect(()=>submit(input(),{...m,clientRequestId:'stale'})).toThrow(/更新/);
});
it('aggregate withdrawal is independent of care submission',()=>{
 recordPermission('ENR-01','aggregate','withdraw',{...meta('withdraw'),expectedVersion:1});expect(submit().data.proId).toBeTruthy();
});
it('rejects paused/cancelled plans, before assignment and outside project period',()=>{
 for(const status of ['paused','cancelled'] as const){assignment().status=status;expect(()=>submit()).toThrow();}assignment().status='open';
 for(const at of ['2026-09-29T02:00:00.000Z','2027-01-01T02:00:00.000Z']){process.env.DEMO_FIXED_NOW=at;expect(()=>submit()).toThrow();}
});
it('rolls back failures after clinical PRO and alert writes and after draft validation',()=>{
 const before=structuredClone(getStore());let calls=0;vi.spyOn(clock,'newId').mockImplementation(prefix=>{if(++calls===4)throw Error('message failure');return `failure-${prefix}-${calls}`;});
 expect(()=>submit()).toThrow('message failure');expect(getStore()).toEqual(before);vi.restoreAllMocks();
 assignment().dueAt='invalid';const invalid=structuredClone(getStore());expect(()=>submit()).toThrow();expect(getStore()).toEqual(invalid);
});
it('project feedback uses natural-hour targets and preserves off-hours emergency advice',()=>{
 expect(submit().data.feedback).toContain('2 小时');expect(submit().data.feedback).not.toContain('工作日');
 installPspTestStore(buildPspTestStore());process.env.DEMO_FIXED_NOW='2026-10-13T13:00:00.000Z';const high=submit();expect(high.data).toMatchObject({offHours:true,emergency:true});expect(high.data.feedback).toContain('急诊');expect(high.data.feedback).toContain('非服务时段');expect(high.data.feedback).toContain('2 小时');
 installPspTestStore(buildPspTestStore());const medium=submit({...input(),items:{...input().items,关节痛:2},flags:{stopIntent:false,missedDoses14d:0}});expect(medium.data.emergency).toBe(false);expect(medium.data.feedback).toContain('24 小时');
});
it('persists explicit revision provenance through full state encode/decode',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');const first=submit(),second=submit({...input(),revisionOf:first.data.proId},meta('revision-persist'));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.patients.get('P-A')!.pro.find(p=>p.id===second.data.proId)).toMatchObject({revisionOf:first.data.proId});
});
it('rejects partial/forged questionnaire links on commit, encode and recovery',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');const first=submit(),valid=structuredClone(getStore());
 const invalidCases=[
  (s:ReturnType<typeof getStore>)=>{s.psp.assignments.find(a=>a.id===assignmentId)!.latestValidResponseId=null;},
  (s:ReturnType<typeof getStore>)=>{s.psp.assignments.find(a=>a.id===assignmentId)!.latestValidResponseId='missing';},
  (s:ReturnType<typeof getStore>)=>{s.psp.assignments.find(a=>a.id===assignmentId)!.firstValidSubmittedAt='2026-10-13T03:00:00.000Z';},
  (s:ReturnType<typeof getStore>)=>{s.patients.get('P-A')!.pro.find(p=>p.id===first.data.proId)!.scaleId='treatment_weekly_v1';},
  (s:ReturnType<typeof getStore>)=>{s.patients.get('P-A')!.pro.find(p=>p.id===first.data.proId)!.items={关节痛:3};},
  (s:ReturnType<typeof getStore>)=>{s.patients.get('P-A')!.pro.find(p=>p.id===first.data.proId)!.flags={missedDoses14d:15};},
  (s:ReturnType<typeof getStore>)=>{const p=s.patients.get('P-A')!,i=p.pro.findIndex(p=>p.id===first.data.proId);s.patients.get('P-0002')!.pro.push(p.pro.splice(i,1)[0]);},
 ];
 for(const corrupt of invalidCases){const s=structuredClone(valid);corrupt(s);await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow();
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());await expect(decodeDemoStore(bytes)).rejects.toThrow();
 installPspTestStore(s);expect(()=>submit(input(),meta('invalid-state'))).toThrow();expect(getStore()).toEqual(s);}
});
it('rejects broken, foreign and cyclic explicit revision chains during persistence',async()=>{
 const {encodeDemoStore}=await import('@/lib/state/persistence');const first=submit(),second=submit({...input(),revisionOf:first.data.proId},meta('revision-chain')),valid=structuredClone(getStore());
 for(const parent of ['missing',second.data.proId]){const s=structuredClone(valid);s.patients.get('P-A')!.pro.find(p=>p.id===second.data.proId)!.revisionOf=parent;await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow();}
 const foreign=structuredClone(valid),p=foreign.patients.get('P-A')!,i=p.pro.findIndex(p=>p.id===first.data.proId);foreign.patients.get('P-0002')!.pro.push(p.pro.splice(i,1)[0]);await expect(encodeDemoStore(foreign).then(()=>undefined)).rejects.toThrow();
});
