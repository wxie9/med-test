import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft,listInternalReports,readInternalReport} from '@/lib/psp/reports';
const project='PSP-BC-ENDO-001';
const meta=(id:string)=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,role:'project_manager' as const,actorId:'project-manager-psp'});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('projects role-specific workbench gates without writing persisted reports or receipts',()=>{
 const snapshot=freezePspSnapshot(project,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('snapshot')).data;
 const first=createReportDraft(snapshot.id,{nextActions:[]},meta('first')).data;
 const before=JSON.stringify(getStore());
 const row=listInternalReports(project,'medical_reviewer','medical-reviewer-psp').summaries[0];
 expect(row).toMatchObject({workflow:{status:'draft',dataReview:null,medicalReview:null},authorizationGate:{status:'eligible'},actionGates:{canSubmit:false},createGate:{canCreate:false}});
 expect(JSON.stringify(getStore())).toBe(before);
 const second=createReportDraft(snapshot.id,{parentVersionId:first.id,nextActions:[]},meta('second')).data;
 const detail=readInternalReport(second.id,'project_manager','project-manager-psp',getStore().seedVersion);
 expect(detail.timeline.map(e=>[e.revision,e.action,e.sequence])).toEqual([[1,'create',first.creationLedgerRevision],[2,'create',second.creationLedgerRevision]]);
 expect(JSON.stringify(detail.timeline)).not.toMatch(/actorId|createdBy|contentDigest|patientId/);
});
it('binds same-clock returns and new signatures to their own revision and excludes another window',async()=>{
 const {submitReport,reviewReport,reviseReport}=await import('@/lib/psp/review');
 const snapshot=freezePspSnapshot(project,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('s')).data;
 const first=createReportDraft(snapshot.id,{nextActions:[]},meta('r')).data;
 submitReport(first.id,{...meta('submit'),expectedVersion:1});
 reviewReport(first.id,{kind:'medical',decision:'return',reason:'PRIVATE_NOTE'},{...meta('return'),expectedVersion:2,role:'medical_reviewer',actorId:'medical-reviewer-psp'});
 const second=reviseReport(first.id,[],meta('revise')).data;
 const other=freezePspSnapshot(project,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('other')).data;
 createReportDraft(other.id,{nextActions:[]},meta('other-draft'));
 const detail=readInternalReport(second.id,'project_manager','project-manager-psp',getStore().seedVersion);
 expect(detail.timeline.map(e=>[e.revision,e.action])).toEqual([[1,'create'],[1,'submit'],[1,'return'],[2,'create']]);
 expect(new Set(detail.timeline.map(e=>e.occurredAt)).size).toBe(1);
 expect(detail.workflow.medicalReview).toBeNull();
 expect(detail.timeline.map(e=>e.sequence)).toEqual([...detail.timeline.map(e=>e.sequence)].sort((a,b)=>a-b));
 expect(JSON.stringify(detail.timeline)).not.toContain('PRIVATE_NOTE');
});

it('projects exact prospective snapshot-parent tuple gates including no parent, old and wrong-window parents without writes',()=>{
 const win={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
 const one=freezePspSnapshot(project,win,meta('one')).data;const first=createReportDraft(one.id,{nextActions:[]},meta('first')).data;
 const latest=createReportDraft(one.id,{parentVersionId:first.id,nextActions:[]},meta('latest')).data;
 const other=freezePspSnapshot(project,{...win,periodEnd:'2026-12-01T00:00:00+08:00'},meta('other')).data;const before=JSON.stringify(getStore());
 const list=listInternalReports(project,'project_manager','project-manager-psp');
 expect(list.draftGates).toEqual(expect.arrayContaining([{snapshotId:one.id,canCreate:false,reason:'报告批次已更新，请选择最新可修订版本'},{snapshotId:one.id,parentVersionId:first.id,canCreate:false,reason:'报告批次已更新，请选择最新可修订版本'},{snapshotId:one.id,parentVersionId:latest.id,canCreate:true,reason:null},{snapshotId:other.id,canCreate:true,reason:null},{snapshotId:other.id,parentVersionId:latest.id,canCreate:false,reason:'修订须属于相同项目、演示版本与报告期间'}]));
 expect(JSON.stringify(getStore())).toBe(before);
});

it('prospective gates preserve source withdrawal and role reasons from the existing server gate',async()=>{
 const {recordPermission}=await import('@/lib/psp/permissions');const {getReportCreateGate}=await import('@/lib/psp/reports');
 const snapshot=freezePspSnapshot(project,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('source')).data;
 const enrollment=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!;recordPermission(enrollment.id,'aggregate','withdraw',{...meta('withdraw'),role:'patient',actorId:enrollment.patientId,expectedVersion:enrollment.version});
 const before=JSON.stringify(getStore());const gate=getReportCreateGate(snapshot.id,'project_manager','project-manager-psp',getStore().seedVersion);
 expect(gate.canCreate).toBe(false);expect(listInternalReports(project,'project_manager','project-manager-psp').draftGates).toContainEqual({snapshotId:snapshot.id,...gate});
 expect(listInternalReports(project,'medical_reviewer','medical-reviewer-psp').draftGates).toContainEqual({snapshotId:snapshot.id,canCreate:false,reason:'仅项目经理可生成或修订模板草稿'});expect(JSON.stringify(getStore())).toBe(before);
});
