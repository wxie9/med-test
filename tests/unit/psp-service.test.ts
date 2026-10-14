import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import * as types from '@/lib/psp/types';
import * as transaction from '@/lib/psp/transaction';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{vi.restoreAllMocks();delete process.env.DEMO_FIXED_NOW;});
it('publishes optional service ledgers while keeping the prior seed shape intact',()=>{
 expect('alertActions' in types.PspState.parse(getStore().psp)).toBe(false);
 expect('educationEvents' in types.PspState.parse(getStore().psp)).toBe(false);
 expect(types).toHaveProperty('PspAlertActionEvent');expect(types).toHaveProperty('PspEducationEvent');
});
it('publishes the isolated service runner',()=>{expect(transaction).toHaveProperty('runServiceCommand');});
import {submitProjectPro} from '@/lib/psp/commands';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import type {CommandMeta} from '@/lib/psp/types';
const planId=(kind:string)=>`PSP-BC-ENDO-001:ENR-01:${kind}:2026-10`;
const cm=(id:string,version=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role:'case_manager',actorId:'case-manager-chen'});
function projectAlerts(){return submitProjectPro({assignmentId:planId('PRO'),patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},{...cm('pro'),actorId:'P-A',role:'patient'}).data.alertIds;}
import * as serviceApi from '@/lib/psp/contact';
async function services(){return serviceApi;}
it('records one failed attempt then one successful interaction covering two alerts and one original contact plan',async()=>{
 const service=await services(),alertIds=projectAlerts(),before=structuredClone(getStore());
 const failed=service.recordInteraction({enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone',outcome:'no_answer',alertIds},cm('failed'));
 expect(failed.data.outcome).toBe('no_answer');expect(getStore().psp.assignments.find(a=>a.id===planId('CONTACT'))!.status).toBe('open');
 const body={enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone' as const,outcome:'reached' as const,alertIds};
 const metadata=cm('call',failed.objectVersion),result=service.recordInteraction(body,metadata),saved=structuredClone(getStore());
 expect(result.data.alertIds).toEqual(alertIds);expect(getStore().psp.serviceEvents).toHaveLength(before.psp.serviceEvents.length+2);
 expect(getStore().psp.assignments.find(a=>a.id===planId('CONTACT'))!.status).toBe('completed');expect(getStore().alerts).toEqual(before.alerts);
 expect(service.recordInteraction(body,metadata)).toEqual(result);expect(getStore()).toEqual(saved);expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
});
it('rejects duplicate/foreign alerts, invalid contact time and completed plans atomically',async()=>{
 const service=await services(),alertIds=projectAlerts(),body={enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone' as const,outcome:'reached' as const,alertIds},before=structuredClone(getStore());
 for(const change of [{alertIds:[alertIds[0],alertIds[0]]},{alertIds:['foreign-alert']},{occurredAt:'2027-01-01T00:00:00Z'},{occurredAt:'2026-10-12T00:00:00Z'},{enrollmentId:'ENR-02'},{channel:'fax'},{recordedAt:PSP_TEST_NOW}])expect(()=>service.recordInteraction({...body,...change} as typeof body,cm('invalid'))).toThrow();
 expect(getStore()).toEqual(before);const r=service.recordInteraction(body,cm('call'));expect(()=>service.recordInteraction(body,cm('new',r.objectVersion))).toThrow(/计划/);
});
it('uses canonical alert machine with separate disposition and doctor close facts for each alert',async()=>{
 const service=await services(),alertIds=projectAlerts();
 const interaction=service.recordInteraction({enrollmentId:'ENR-01',channel:'phone',outcome:'reached',alertIds},cm('call'));
 for(const id of alertIds){let version=getStore().alerts.find(a=>a.id===id)!.version??1;
  for(const action of ['accept','start'] as const)version=service.actOnProjectAlert(id,{action},cm(`${id}:${action}`,version)).objectVersion;
  expect(getStore().psp.alertActions!.filter(e=>e.alertId===id).every(e=>!e.disposition)).toBe(true);
  version=service.actOnProjectAlert(id,{action:'submit_review',disposition:{category:'contact',summary:'已联系并记录支持需求',interactionIds:[interaction.data.interactionId]}},cm(`${id}:review`,version)).objectVersion;
  const closed=service.actOnProjectAlert(id,{action:'close',note:'已复核处置记录',followupTask:{type:'复评',owner:'张医生',dueAt:'2026-10-15T17:30:00+08:00'}},{...cm(`${id}:close`,version),role:'doctor',actorId:'doctor-zhang'});
  expect(closed.data.action).toBe('close');const task=getStore().tasks.find(t=>t.id===closed.data.followupTaskId)!,plan=getStore().psp.assignments.find(a=>a.id===closed.data.followupAssignmentId)!;
  expect(task).toMatchObject({status:'open',due:'2026-10-15'});expect(plan).toMatchObject({status:'open',dueAt:'2026-10-15T09:30:00.000Z'});
 }
 expect(getStore().psp.alertActions!.filter(e=>e.action==='close')).toHaveLength(2);expect(getStore().psp.serviceEvents.filter(e=>e.channel)).toHaveLength(1);
});
it('rejects absent/foreign disposition, unsupported actions, wrong roles and non-future close without any partial writes',async()=>{
 const service=await services(),[id]=projectAlerts();let version=getStore().alerts.find(a=>a.id===id)!.version??1;
 for(const action of ['accept','start'] as const)version=service.actOnProjectAlert(id,{action},cm(action,version)).objectVersion;
 const before=structuredClone(getStore());expect(()=>service.actOnProjectAlert(id,{action:'submit_review',disposition:{category:'support',summary:'review',interactionIds:['seed-contact']}},cm('review',version))).toThrow();
 expect(()=>service.actOnProjectAlert(id,{action:'assign'} as never,cm('assign',version))).toThrow();expect(getStore()).toEqual(before);
});
it('rejects forged contact and partial clinical review links on encode and recovery',async()=>{
 const service=await services(),[id]=projectAlerts(),call=service.recordInteraction({enrollmentId:'ENR-01',channel:'phone',outcome:'reached',alertIds:[id]},cm('call'));
 let version=getStore().alerts.find(a=>a.id===id)!.version??1;
 for(const action of ['accept','start'] as const)version=service.actOnProjectAlert(id,{action},cm(action,version)).objectVersion;
 version=service.actOnProjectAlert(id,{action:'submit_review',disposition:{category:'support',summary:'contact recorded',interactionIds:[call.data.interactionId]}},cm('review',version)).objectVersion;
 service.actOnProjectAlert(id,{action:'close',note:'reviewed',followupTask:{type:'review',owner:'doctor',dueAt:'2026-10-15T02:00:00Z'}},{...cm('close',version),role:'doctor',actorId:'doctor-zhang'});
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore());
 const corruptions=[(s:typeof valid)=>{s.psp.serviceEvents.at(-1)!.enrollmentId='ENR-02';},(s:typeof valid)=>{s.psp.alertActions!.at(-1)!.followupTaskId='missing';},(s:typeof valid)=>{s.psp.alertActions!.at(-1)!.followupAssignmentId='missing';},(s:typeof valid)=>{s.psp.alertActions!.find(e=>e.action==='submit_review')!.disposition!.interactionIds=['missing'];},(s:typeof valid)=>{s.messages=s.messages.filter(m=>m.kind!=='plan_update');},(s:typeof valid)=>{s.psp.alertActions!.at(-1)!.actorId='case-manager-chen';}];
 for(const corrupt of corruptions){const s=structuredClone(valid);corrupt(s);await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow();const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());await expect(decodeDemoStore(bytes)).rejects.toThrow();}
 expect((await decodeDemoStore(await encodeDemoStore(valid))).psp.alertActions).toEqual(valid.psp.alertActions);
});
import {recordPermission} from '@/lib/psp/permissions';
import {actOnAlert} from '@/lib/clinic/actions';
import * as clock from '@/lib/state/clock';
it('normalizes historical contact instants, captures server record time and replays exactly after service withdrawal',async()=>{
 const service=await services(),body={enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'message' as const,outcome:'refused' as const,alertIds:[],occurredAt:'2026-10-12T12:00:00+08:00'},metadata=cm('historical');
 const result=service.recordInteraction(body,metadata);expect(result.data).toMatchObject({occurredAt:'2026-10-12T04:00:00.000Z',recordedAt:PSP_TEST_NOW});
 recordPermission('ENR-01','service','withdraw',{...cm('withdraw'),role:'patient',actorId:'P-A',expectedVersion:1});const before=structuredClone(getStore());
 expect(service.recordInteraction({...body,occurredAt:'2026-10-12T04:00:00Z'},metadata)).toEqual(result);expect(getStore()).toEqual(before);
 expect(()=>service.recordInteraction(body,cm('fresh',result.objectVersion))).toThrow(/授权|成员/);expect(()=>service.recordInteraction({...body,outcome:'reached'},metadata)).toThrow(/请求编号/);
});
it('legacy clinical transitions invalidate PSP CAS without claiming a PSP disposition',async()=>{
 const service=await services(),[id]=projectAlerts(),initial=getStore().alerts.find(a=>a.id===id)!.version??1;
 actOnAlert(id,'accept','case-manager-chen');expect(()=>service.actOnProjectAlert(id,{action:'start'},cm('stale',initial))).toThrow(/更新/);
 actOnAlert(id,'start','case-manager-chen');actOnAlert(id,'submit_review','case-manager-chen','legacy note');const before=structuredClone(getStore());
 expect(()=>service.actOnProjectAlert(id,{action:'close',note:'reviewed',followupTask:{type:'review',owner:'doctor',dueAt:'2026-10-15T02:00:00Z'}},{...cm('close',getStore().alerts.find(a=>a.id===id)!.version),role:'doctor',actorId:'doctor-zhang'})).toThrow(/结构化/);expect(getStore()).toEqual(before);
});
it('doctor close rejects wrong identity, non-future or out-of-project due date and rolls back injected task/message failure',async()=>{
 const service=await services(),[id]=projectAlerts(),call=service.recordInteraction({enrollmentId:'ENR-01',channel:'phone',outcome:'reached',alertIds:[id]},cm('call'));let version=getStore().alerts.find(a=>a.id===id)!.version??1;
 for(const action of ['accept','start'] as const)version=service.actOnProjectAlert(id,{action},cm(action,version)).objectVersion;
 version=service.actOnProjectAlert(id,{action:'submit_review',disposition:{category:'support',summary:'contact recorded',interactionIds:[call.data.interactionId]}},cm('review',version)).objectVersion;
 const body={action:'close' as const,note:'reviewed',followupTask:{type:'review',owner:'doctor',dueAt:'2026-10-15T02:00:00Z'}},metadata={...cm('close',version),role:'doctor' as const,actorId:'doctor-zhang'},before=structuredClone(getStore());
 expect(()=>service.actOnProjectAlert(id,body,cm('wrong',version))).toThrow();for(const dueAt of [PSP_TEST_NOW,'2027-01-01T00:00:00Z','garbage'])expect(()=>service.actOnProjectAlert(id,{...body,followupTask:{...body.followupTask,dueAt}},metadata)).toThrow();expect(getStore()).toEqual(before);
 const create=clock.newId;vi.spyOn(clock,'newId').mockImplementation(prefix=>{if(prefix==='msg')throw Error('injected message failure');return create(prefix);});expect(()=>service.actOnProjectAlert(id,body,metadata)).toThrow('injected message failure');expect(getStore()).toEqual(before);
});
it('does not authorize care through aggregate scope and records contact failures without affecting alerts or clinical tasks',async()=>{
 const service=await services(),alertIds=projectAlerts();recordPermission('ENR-01','aggregate','withdraw',{...cm('aggregate'),role:'patient',actorId:'P-A'});const before=structuredClone(getStore());
 const result=service.recordInteraction({enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone',outcome:'channel_unavailable',alertIds},cm('failure'));expect(result.data.outcome).toBe('channel_unavailable');expect(getStore().alerts).toEqual(before.alerts);expect(getStore().tasks).toEqual(before.tasks);expect(getStore().psp.assignments.find(a=>a.id===planId('CONTACT'))!.status).toBe('open');
});
it('rejects missing contact completion projection and failure-only completion during encode',async()=>{
 const service=await services(),body={enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone' as const,outcome:'reached' as const,alertIds:[]};service.recordInteraction(body,cm('call'));
 const {encodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore());valid.psp.assignments.find(a=>a.id===planId('CONTACT'))!.status='open';await expect(encodeDemoStore(valid).then(()=>undefined)).rejects.toThrow();
 installPspTestStore(buildPspTestStore());service.recordInteraction({...body,outcome:'no_answer'},cm('failed'));const failure=structuredClone(getStore());failure.psp.assignments.find(a=>a.id===planId('CONTACT'))!.status='completed';await expect(encodeDemoStore(failure).then(()=>undefined)).rejects.toThrow();
});
it('rejects persisted live contacts without service authorization at their historical occurrence or server recording time',async()=>{
 const service=await services();service.recordInteraction({enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone',outcome:'no_answer',alertIds:[],occurredAt:'2026-10-12T02:00:00Z'},cm('historical'));
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore());
 for(const at of ['2026-10-12T03:00:00.000Z','2026-10-13T03:00:00.000Z']){
  const s=structuredClone(valid),grant=s.psp.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;grant.occurredAt=at;grant.recordedAt=at;
  await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow(/授权|authorization/);
  const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());await expect(decodeDemoStore(bytes)).rejects.toThrow(/授权|authorization/);
 }
 const recording=structuredClone(valid),contact=recording.psp.serviceEvents.at(-1)!;contact.sequence++;
 recording.psp.ledgerRevision+=3;
 recording.psp.permissionEvents.push({id:'historical-withdraw',enrollmentId:'ENR-01',scope:'service',action:'withdraw',textVersion:'psp-consent-v1',occurredAt:'2026-10-12T12:00:00.000Z',recordedAt:'2026-10-12T12:00:00.000Z',actorId:'P-A',sequence:contact.sequence-1},{id:'later-regrant',enrollmentId:'ENR-01',scope:'service',action:'grant',textVersion:'psp-consent-v1',occurredAt:'2026-10-14T00:00:00.000Z',recordedAt:'2026-10-14T00:00:00.000Z',actorId:'P-A',sequence:contact.sequence+1});
 await expect(encodeDemoStore(recording).then(()=>undefined)).rejects.toThrow(/授权|authorization/);

});

it('rejects shared or wrong-origin doctor and education followups on encode and recovery while allowing later completion',async()=>{
 const service=await services(),alertIds=projectAlerts(),call=service.recordInteraction({enrollmentId:'ENR-01',alertIds,channel:'phone',outcome:'reached'},cm('shared-contact'));
 for(const id of alertIds){let v=getStore().alerts.find(a=>a.id===id)!.version!;
  for(const action of ['accept','start'] as const)v=service.actOnProjectAlert(id,{action},cm(id+action,v)).objectVersion;
  v=service.actOnProjectAlert(id,{action:'submit_review',disposition:{category:'support',summary:'actual contact',interactionIds:[call.data.interactionId]}},cm(id+'review',v)).objectVersion;
  service.actOnProjectAlert(id,{action:'close',note:'reviewed',followupTask:{type:'教育反馈联系跟进',owner:'doctor',dueAt:'2026-10-14T02:00:00Z'}},{...cm(id+'close',v),role:'doctor',actorId:'doctor-zhang'});
 }
 const {sendEducation,recordEducationOpened,recordEducationFeedback}=await import('@/lib/psp/education'),educationId=planId('EDUCATION');
 const eduMeta=(request:string,patient=false):CommandMeta=>({...cm(request,getStore().psp.assignments.find(a=>a.id===educationId)!.version),role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
 sendEducation(educationId,getStore().psp.educationContents[0].id,eduMeta('send'));recordEducationOpened(educationId,eduMeta('open',true));recordEducationFeedback(educationId,{understood:false,needsHelp:true},eduMeta('feedback',true));
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore());
 const closes=(s:typeof valid)=>s.psp.alertActions!.filter(e=>e.action==='close'),feedback=(s:typeof valid)=>s.psp.educationEvents!.find(e=>e.action==='feedback')!;
 const corruptions=[
  (s:typeof valid)=>{closes(s)[1].followupTaskId=closes(s)[0].followupTaskId;},
  (s:typeof valid)=>{closes(s)[1].followupAssignmentId=closes(s)[0].followupAssignmentId;},
  (s:typeof valid)=>{closes(s)[1].followupTaskId=closes(s)[0].followupTaskId;closes(s)[1].followupAssignmentId=closes(s)[0].followupAssignmentId;},
  (s:typeof valid)=>{const [a,b]=closes(s);[a.followupAssignmentId,b.followupAssignmentId]=[b.followupAssignmentId,a.followupAssignmentId];},
  (s:typeof valid)=>{feedback(s).followupAssignmentId=closes(s)[0].followupAssignmentId;},
  (s:typeof valid)=>{const e=feedback(s),c=closes(s)[0];[e.followupAssignmentId,c.followupAssignmentId]=[c.followupAssignmentId,e.followupAssignmentId];},
 ];
 const outcomes:PromiseSettledResult<unknown>[]=[];
 for(const corrupt of corruptions){const s=structuredClone(valid);corrupt(s);outcomes.push(...await Promise.allSettled([encodeDemoStore(s).then(()=>undefined)]));
  const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());outcomes.push(...await Promise.allSettled([decodeDemoStore(bytes).then(()=>undefined)]));
 }
 expect(outcomes.map(o=>o.status)).toEqual(Array(12).fill('rejected'));
 expect(await decodeDemoStore(await encodeDemoStore(valid))).toEqual(valid);
 const futureIds=[...closes(valid).map(e=>e.followupAssignmentId!),feedback(valid).followupAssignmentId!];
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';
 for(const id of futureIds)service.recordInteraction({enrollmentId:'ENR-01',assignmentId:id,alertIds:[],channel:'phone',outcome:'reached'},cm('complete:'+id));
 expect(futureIds.every(id=>getStore().psp.assignments.find(a=>a.id===id)!.status==='completed')).toBe(true);
 expect((await decodeDemoStore(await encodeDemoStore(getStore()))).psp.alertActions).toEqual(valid.psp.alertActions);
});

it.each(['enrollment','assignment'] as const)('%s runner captures nested live data as an independent receipt snapshot',kind=>{
 const execute=(request:string,value?:number)=>kind==='enrollment'
  ? transaction.transact('ENR-01',{},cm(request,getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version),['case_manager'],s=>{if(value)s.psp.project.contactTargets.high=value;return s.psp.project.contactTargets;})
  : transaction.transactAssignment(planId('PRO'),'P-A',{}, {...cm(request,getStore().psp.assignments.find(a=>a.id===planId('PRO'))!.version),role:'patient',actorId:'P-A'},s=>{if(value)s.psp.project.contactTargets.high=value;return {data:s.psp.project.contactTargets,changed:false};});
 const first=execute('nested-snapshot');execute('later-mutation',3);expect(execute('nested-snapshot')).toEqual(first);
});

it('rejects contact recording outside the project window on encode and recovery while allowing cross-cutoff recording',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-13T03:00:00.000Z';
 const service=await services();service.recordInteraction({enrollmentId:'ENR-01',assignmentId:planId('CONTACT'),channel:'phone',outcome:'no_answer',alertIds:[],occurredAt:'2026-10-12T02:00:00Z'},cm('cross-cutoff'));
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore()),contact=valid.psp.serviceEvents.at(-1)!;
 expect(Date.parse(contact.occurredAt)).toBeLessThan(Date.parse(valid.psp.project.cutoffAt));expect(Date.parse(contact.recordedAt)).toBeGreaterThan(Date.parse(valid.psp.project.cutoffAt));
 expect(await decodeDemoStore(await encodeDemoStore(valid))).toEqual(valid);
 const corrupt=structuredClone(valid);corrupt.psp.serviceEvents.at(-1)!.recordedAt='2027-01-01T00:00:00.000Z';
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...corrupt,patients:[...corrupt.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const outcomes=await Promise.allSettled([encodeDemoStore(corrupt).then(()=>undefined),decodeDemoStore(bytes).then(()=>undefined)]);
 expect(outcomes.map(o=>o.status)).toEqual(['rejected','rejected']);
});
