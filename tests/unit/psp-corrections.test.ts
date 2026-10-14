import {beforeEach,afterEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import type {CommandMeta} from '@/lib/psp/types';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
const cm=(id:string,version=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role:'case_manager',actorId:'case-manager-chen'});
const reviewer=(id:string,version=1):CommandMeta=>({...cm(id,version),role:'data_reviewer',actorId:'data-reviewer-psp'});
const body=()=>({sourceRef:{kind:'contact' as const,id:getStore().psp.serviceEvents.find(e=>e.enrollmentId==='ENR-01')!.id},correctedValue:{kind:'contact' as const,channel:'phone' as const,outcome:'reached' as const},reason:'核对原始服务记录',occurredAt:'2026-10-12T12:00:00+08:00'});
it('proposes fixed typed evidence then reviewer verifies separately without changing any original facts',async()=>{
 const service=await import('@/lib/psp/corrections'),before=structuredClone(getStore());const proposed=service.proposeCorrection(body(),cm('propose'));
 expect(proposed.data).toMatchObject({status:'proposed',version:1,occurredAt:'2026-10-12T04:00:00.000Z',recordedAt:PSP_TEST_NOW,verifiedAt:null,verificationSequence:null});
 expect(service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:PSP_TEST_NOW,ledgerRevision:getStore().psp.ledgerRevision})).toEqual([]);
 const verified=service.verifyCorrection(proposed.data.id,reviewer('verify'));expect(verified.data).toMatchObject({status:'verified',version:2,verifiedBy:'data-reviewer-psp',verifiedAt:PSP_TEST_NOW});
 expect(service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:PSP_TEST_NOW,ledgerRevision:verified.data.verificationSequence!-1})).toEqual([]);expect(service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:PSP_TEST_NOW,ledgerRevision:getStore().psp.ledgerRevision})).toHaveLength(1);
 for(const key of ['serviceEvents','assignments','alertActions','educationResults'] as const)expect(getStore().psp[key]).toEqual(before.psp[key]);for(const key of ['patients','alerts','tasks','gapTasks','messages'] as const)expect(getStore()[key]).toEqual(before[key]);expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
 expect(service.verifyCorrection(proposed.data.id,reviewer('again',2)).data).toEqual(verified.data);expect(service.proposeCorrection(body(),cm('propose'))).toEqual(proposed);expect(()=>service.proposeCorrection(body(),cm('duplicate',proposed.objectVersion))).toThrow(/补录/);
 expect(Object.isFrozen(getStore().psp.corrections![0])).toBe(true);expect(Object.isFrozen(getStore().psp.corrections![0].sourceValue)).toBe(true);
});
it('rejects wrong role, arbitrary sources and fields, invalid time, and stale CAS atomically',async()=>{
 const service=await import('@/lib/psp/corrections'),before=structuredClone(getStore());
 for(const change of [{sourceRef:{kind:'gap',id:'missing'}},{sourceRef:{kind:'contact',id:'missing'}},{correctedValue:{kind:'contact',channel:'fax',outcome:'reached'}},{correctedValue:{kind:'contact',channel:'phone',outcome:'reached',taken:1}},{reason:' '},{occurredAt:'2027-01-01T00:00:00Z'},{occurredAt:'2026-09-30T00:00:00Z'},{recordedAt:PSP_TEST_NOW}])expect(()=>service.proposeCorrection({...body(),...change} as never,cm('bad'))).toThrow();
 expect(()=>service.proposeCorrection(body(),reviewer('wrong'))).toThrow();expect(()=>service.proposeCorrection(body(),cm('stale',2))).toThrow();expect(getStore()).toEqual(before);
 const proposed=service.proposeCorrection(body(),cm('valid')),after=structuredClone(getStore());expect(()=>service.verifyCorrection(proposed.data.id,cm('verify'))).toThrow();expect(()=>service.verifyCorrection(proposed.data.id,reviewer('stale',2))).toThrow();expect(getStore()).toEqual(after);
});
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
it('rejects correction link, typed value, status/version/metadata and sequence corruption on both persistence boundaries',async()=>{
 const service=await import('@/lib/psp/corrections'),proposed=service.proposeCorrection(body(),cm('propose'));service.verifyCorrection(proposed.data.id,reviewer('verify'));
 const valid=structuredClone(getStore());expect(await decodeDemoStore(await encodeDemoStore(valid))).toEqual(valid);
 const corruptions=[(s:typeof valid)=>{s.psp.corrections![0].sourceRef.id='missing';},(s:typeof valid)=>{s.psp.corrections![0].sourceValue.outcome='reached';},(s:typeof valid)=>{s.psp.corrections![0].interactionId='missing';},(s:typeof valid)=>{s.psp.corrections![0].assignmentId='missing';},(s:typeof valid)=>{s.psp.corrections![0].alertIds=['missing'];},(s:typeof valid)=>{s.psp.corrections![0].version=1;},(s:typeof valid)=>{s.psp.corrections![0].status='proposed';},(s:typeof valid)=>{s.psp.corrections![0].verifiedBy='case-manager-chen';},(s:typeof valid)=>{s.psp.corrections![0].verifiedAt='2026-10-12T02:00:00.000Z';},(s:typeof valid)=>{s.psp.corrections![0].verificationSequence=s.psp.corrections![0].sequence;},(s:typeof valid)=>{s.psp.corrections![0].occurredAt='2026-09-29T00:00:00.000Z';},(s:typeof valid)=>{s.psp.corrections![0].correctedValue={...s.psp.corrections![0].correctedValue,due:1} as never;}];
 for(const corrupt of corruptions){const s=structuredClone(valid);corrupt(s);await expect(encodeDemoStore(s)).rejects.toThrow();const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());await expect(decodeDemoStore(bytes)).rejects.toThrow();}
},15000);
it('captures proposal, verification and selector copies independently and excludes late verification from old cutoff',async()=>{
 const service=await import('@/lib/psp/corrections'),{recordPermission}=await import('@/lib/psp/permissions'),input=body(),proposed=service.proposeCorrection(input,cm('proposal'));
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';const meta=reviewer('verified'),verified=service.verifyCorrection(proposed.data.id,meta);
 expect(service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:PSP_TEST_NOW,ledgerRevision:getStore().psp.ledgerRevision})).toHaveLength(0);
 const selection=service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:'2026-10-14T02:00:00.000Z',ledgerRevision:getStore().psp.ledgerRevision});selection[0].sourceValue.outcome='refused';verified.data.sourceValue.outcome='refused';proposed.data.correctedValue.outcome='refused';
 expect(service.proposeCorrection(input,cm('proposal')).data.correctedValue.outcome).toBe('reached');expect(service.verifyCorrection(proposed.data.id,meta).data.sourceValue.outcome).toBe('no_answer');
 recordPermission('ENR-01','service','withdraw',{...cm('withdraw',getStore().psp.enrollments[0].version),role:'patient',actorId:'P-A'});const before=structuredClone(getStore());expect(service.verifyCorrection(proposed.data.id,meta).data.status).toBe('verified');expect(getStore()).toEqual(before);
});
it('strict correction POST rejects unsupported clinical values and cross-project paths',async()=>{
 const route=await import('@/app/api/psp/projects/[projectId]/corrections/route'),ctx={params:Promise.resolve({projectId:getStore().psp.project.id})},before=structuredClone(getStore());
 const post=(body:unknown,params=ctx)=>route.POST(new Request('http://local/api',{method:'POST',body:JSON.stringify(body)}),params);
 for(const request of [{action:'propose',...body(),recordedAt:PSP_TEST_NOW,meta:cm('bad')},{action:'propose',...body(),correctedValue:{taken:1},meta:cm('bad')},{action:'verify',correctionId:'missing',reason:'unknown',meta:reviewer('bad')},{action:'reject',meta:cm('bad')}])expect((await post(request)).status).toBe(400);
 expect((await post({action:'propose',...body(),meta:cm('foreign')},{params:Promise.resolve({projectId:'foreign'})})).status).toBe(404);expect(getStore()).toEqual(before);
 expect((await post({action:'propose',...body(),meta:cm('ok')})).status).toBe(200);
});
it('marking a legacy gap task done cannot create, verify, or alter PSP evidence',async()=>{
 const service=await import('@/lib/psp/corrections'),{completeGapTask}=await import('@/lib/governance/gapTasks');const proposal=service.proposeCorrection(body(),cm('propose'));getStore().gapTasks.push({id:'old-gap',source:'clinical',field:'adherence',patientCount:1,status:'open',createdAt:PSP_TEST_NOW});const before=structuredClone(getStore().psp);completeGapTask('old-gap');expect(getStore().psp).toEqual(before);expect(getStore().psp.corrections![0].id).toBe(proposal.data.id);expect(service.selectVerifiedContactCorrectionsAsOf(getStore().psp,{cutoffAt:PSP_TEST_NOW,ledgerRevision:getStore().psp.ledgerRevision})).toEqual([]);
});
it('refuses a verification time earlier than real proposal recording atomically',async()=>{
 const service=await import('@/lib/psp/corrections'),proposal=service.proposeCorrection(body(),cm('proposal')),before=structuredClone(getStore());process.env.DEMO_FIXED_NOW='2026-10-13T01:59:59.000Z';
 expect(()=>service.verifyCorrection(proposal.data.id,reviewer('bad'))).toThrow(/时间/);expect(getStore()).toEqual(before);
});
it('rejects fresh verification after service withdrawal without changes while replaying the original receipt exactly',async()=>{
 const service=await import('@/lib/psp/corrections'),{recordPermission}=await import('@/lib/psp/permissions');
 const proposed=service.proposeCorrection(body(),cm('propose')),request=reviewer('verify'),verified=service.verifyCorrection(proposed.data.id,request);
 recordPermission('ENR-01','service','withdraw',{...cm('withdraw',getStore().psp.enrollments[0].version),role:'patient',actorId:'P-A'});
 const before=structuredClone(getStore());
 expect(service.verifyCorrection(proposed.data.id,request)).toEqual(verified);
 expect(getStore()).toEqual(before);
 expect(()=>service.verifyCorrection(proposed.data.id,reviewer('fresh-verify',2))).toThrow(/授权/);
 expect(getStore()).toEqual(before);
});
it('rejects fresh verification of a verified correction outside the project period atomically',async()=>{
 const service=await import('@/lib/psp/corrections'),proposed=service.proposeCorrection(body(),cm('propose'));
 const request=reviewer('verify'),verified=service.verifyCorrection(proposed.data.id,request),before=structuredClone(getStore());
 process.env.DEMO_FIXED_NOW='2027-01-01T02:00:00.000Z';
 expect(()=>service.verifyCorrection(proposed.data.id,reviewer('fresh-outside-project',2))).toThrow(/项目/);
 expect(getStore()).toEqual(before);
 expect(service.verifyCorrection(proposed.data.id,request)).toEqual(verified);
 expect(getStore()).toEqual(before);
});
it('rejects fresh verification of a verified correction before its real recording time atomically',async()=>{
 const service=await import('@/lib/psp/corrections'),proposed=service.proposeCorrection(body(),cm('propose'));
 service.verifyCorrection(proposed.data.id,reviewer('verify'));const before=structuredClone(getStore());
 process.env.DEMO_FIXED_NOW='2026-10-13T01:59:59.000Z';
 expect(()=>service.verifyCorrection(proposed.data.id,reviewer('fresh-before-recording',2))).toThrow(/时间/);
 expect(getStore()).toEqual(before);
});
it('keeps an authorized fresh verification a no-op for correction values and the original verification sequence',async()=>{
 const service=await import('@/lib/psp/corrections'),proposed=service.proposeCorrection(body(),cm('propose'));
 const verified=service.verifyCorrection(proposed.data.id,reviewer('verify')),before=structuredClone(getStore().psp.corrections);
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';
 const fresh=service.verifyCorrection(proposed.data.id,reviewer('fresh-authorized',2));
 expect(fresh.data).toEqual(verified.data);expect(fresh.objectVersion).toBe(2);
 expect(getStore().psp.corrections).toEqual(before);
 expect(fresh.data.verificationSequence).toBe(verified.data.verificationSequence);
});
