import {beforeEach,afterEach,expect,it} from 'vitest';
import {getStore} from '@/lib/state/store';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
const projectId='PSP-BC-ENDO-001',assignmentId=`${projectId}:ENR-01:EDUCATION:2026-10`,contentVersionId='EDU-SYNTHETIC-001';
const meta=(id:string,version=1,patient=false)=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
const request=(body:unknown)=>new Request('http://local/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const contactRoute=()=>import('@/app/api/psp/projects/[projectId]/interactions/route');
const educationRoute=()=>import('@/app/api/psp/education/[assignmentId]/route');
const alertRoute=()=>import('@/app/api/psp/alerts/[alertId]/actions/route');
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('contact route validates strict input, project path, roles and CAS with no writes on rejection',async()=>{
 const route=await contactRoute(),body={enrollmentId:'ENR-01',assignmentId:`${projectId}:ENR-01:CONTACT:2026-10`,alertIds:[],channel:'phone',outcome:'no_answer',meta:meta('call')},context={params:Promise.resolve({projectId})},before=structuredClone(getStore());
 expect((await route.POST(request({...body,recordedAt:PSP_TEST_NOW}),context)).status).toBe(400);expect((await route.POST(request(body),{params:Promise.resolve({projectId:'foreign'})})).status).toBe(404);
 expect((await route.POST(request({...body,meta:meta('wrong',1,true)}),context)).status).toBe(403);expect((await route.POST(request({...body,meta:meta('stale',5)}),context)).status).toBe(409);expect(getStore()).toEqual(before);
 const result=await route.POST(request(body),context);expect(result.status).toBe(200);expect((await result.json()).data.outcome).toBe('no_answer');
});
it('education route GET is read-only and strict stage POST keeps sender and patient boundaries',async()=>{
 const route=await educationRoute(),context={params:Promise.resolve({assignmentId})};
 const unsent=await route.GET(new Request('http://local/api?role=patient&actorId=P-A'),context);expect(unsent.status).toBe(200);expect((await unsent.json()).content).toBeNull();
 expect((await route.POST(request({action:'send',contentVersionId,meta:meta('send',1,true)}),context)).status).toBe(403);
 const send=await route.POST(request({action:'send',contentVersionId,meta:meta('send')}),context);expect(send.status).toBe(200);const sent=await send.json(),before=structuredClone(getStore());
 const get=await route.GET(new Request('http://local/api?role=patient&actorId=P-A'),context);expect(get.status).toBe(200);expect((await get.json()).result.openedAt).toBeNull();expect(getStore()).toEqual(before);
 expect((await route.GET(new Request('http://local/api?role=patient&actorId=P-0002'),context)).status).toBe(403);expect((await route.POST(request({action:'open',extra:true,meta:meta('open',sent.objectVersion,true)}),context)).status).toBe(400);
 const open=await route.POST(request({action:'open',meta:meta('open',sent.objectVersion,true)}),context);expect(open.status).toBe(200);const opened=await open.json();
 const feedback=await route.POST(request({action:'feedback',understood:true,needsHelp:true,meta:meta('feedback',opened.objectVersion,true)}),context);expect(feedback.status).toBe(200);
});
it('alert route rejects unsupported actions and nonexistent project alerts',async()=>{
 const route=await alertRoute(),context={params:Promise.resolve({alertId:'missing'})};expect((await route.POST(request({action:'assign',meta:meta('unsupported')}),context)).status).toBe(400);expect((await route.POST(request({action:'accept',meta:meta('missing')}),context)).status).toBe(404);
});
