import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {snapshotAggregateUsability} from '@/lib/psp/snapshotAuthorization';
import {recordPermission} from '@/lib/psp/permissions';
import {recordInteraction} from '@/lib/psp/contact';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {snapshotDigest} from '@/lib/psp/snapshotValidation';
import {computePspMetrics} from '@/lib/psp/metrics';
import {resolveAggregateGrantProjection} from '@/lib/psp/aggregateGrantProjection';
import {protectMetricGroups} from '@/lib/psp/protection';
import {createSnapshotSourceGraph} from '@/lib/psp/snapshotSourceGraph';
import type {CommandMeta} from '@/lib/psp/types';
import type {SnapshotMetricEvidence,PspServiceSnapshot} from '@/lib/psp/snapshotTypes';

const projectId='PSP-BC-ENDO-001';
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const meta=(id:string,overrides:Partial<CommandMeta>={}):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,actorId:'project-manager-psp',role:'project_manager',...overrides});
const permission=(id:string,action:'grant'|'withdraw',scope:'service'|'aggregate'='aggregate',enrollmentId='ENR-01',actorId='P-A')=>recordPermission(enrollmentId,scope,action,meta(id,{role:'patient',actorId,expectedVersion:getStore().psp.enrollments.find(e=>e.id===enrollmentId)!.version}));
const freeze=(id:string,cutoffAt=PSP_TEST_NOW)=>freezePspSnapshot(projectId,{...window,cutoffAt},meta(id)).data;
const metric=(snapshot:PspServiceSnapshot,key:string,scope:'internal'|'aggregate'='aggregate')=>(scope==='aggregate'?snapshot.aggregateMetrics:snapshot.internalMetrics).find(m=>m.key===key)!;
const usable=(snapshot:PspServiceSnapshot)=>snapshotAggregateUsability(snapshot,getStore().psp,process.env.DEMO_FIXED_NOW!).usable;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});

it('new freezes exclude terminated aggregate intervals while preserving all internal history and old snapshots',async()=>{
 const old=freeze('before'),oldBytes=structuredClone(old);
 permission('withdraw','withdraw');
 const next=freeze('after');
 expect(metric(next,'period_members').value).toBe(13);
 expect(metric(next,'period_members','internal').value).toBe(18);
 expect(metric(next,'contact_completion').denominator).toBe(13);
 expect(metric(next,'contact_completion','internal').denominator).toBe(18);
 expect(next).toHaveProperty('aggregateAuthorizationPolicy','current_grants_v1');
 expect(usable(old)).toBe(false);expect(usable(next)).toBe(true);
 expect(getStore().psp.snapshots![0]).toEqual(oldBytes);
 expect(next.sources.some(s=>s.kind==='permission'&&s.value.enrollmentId==='ENR-01'&&s.value.scope==='aggregate'&&s.value.action==='grant')).toBe(true);
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![1]).toEqual(next);expect(restored.psp.snapshots![0]).toEqual(oldBytes);
});

it('a withdrawal after metric cutoff but before freeze still excludes the old interval',()=>{
 permission('after-cutoff','withdraw');
 const snapshot=freeze('earlier-cutoff','2026-10-12T10:00:00+08:00');
 expect(metric(snapshot,'period_members').value).toBe(13);expect(usable(snapshot)).toBe(true);
});

it('same-clock regrant contributes only new facts and never restores an earlier snapshot',async()=>{
 const old=freeze('before-regrant');
 permission('close-old','withdraw');
 const assignmentId=`${projectId}:ENR-01:CONTACT:2026-10`;
 const call=recordInteraction({enrollmentId:'ENR-01',assignmentId,channel:'phone',outcome:'no_answer',alertIds:[]},meta('between-intervals',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version})).data;
 permission('new-interval','grant');
 const beforeNew=freeze('before-new-fact');
 const newCall=recordInteraction({enrollmentId:'ENR-01',assignmentId,channel:'phone',outcome:'reached',alertIds:[]},meta('new-fact',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version})).data;
 const next=freeze('after-new-fact');
 const oldCalls=getStore().psp.serviceEvents.filter(e=>e.enrollmentId==='ENR-01'&&e.id!==newCall.id).map(e=>e.id);
 expect(usable(old)).toBe(false);expect(usable(beforeNew)).toBe(true);expect(usable(next)).toBe(true);
 expect(metric(beforeNew,'interaction_successes').sourceRefs).not.toContain(call.id);
 expect(metric(next,'interaction_successes').sourceRefs).toContain(newCall.id);
 for(const ref of oldCalls)expect(metric(next,'interaction_successes').sourceRefs).not.toContain(ref);
 expect(metric(next,'period_members').value).toBe(14);
 const frozen=JSON.stringify(next);permission('close-new','withdraw');permission('third-interval','grant');
 expect(usable(next)).toBe(false);expect(JSON.stringify(getStore().psp.snapshots!.find(s=>s.id===next.id))).toBe(frozen);
 await decodeDemoStore(await encodeDemoStore(getStore()));
});

it('service-only withdrawal retains lawful aggregate history and supporting-only withdrawals do not block',()=>{
 const old=freeze('service-before');permission('service-withdraw','withdraw','service');
 const next=freeze('service-after');
 expect(metric(next,'period_members').value).toBe(14);expect(usable(old)).toBe(true);expect(usable(next)).toBe(true);
});

it('strict policy metadata is digest bound and legacy absent metadata remains absent across hydration',async()=>{
 freeze('metadata');
 const altered=structuredClone(getStore()),snapshot=altered.psp.snapshots![0];
 (snapshot as unknown as {aggregateAuthorizationPolicy:string}).aggregateAuthorizationPolicy='unknown_policy';
 const {contentDigest,...body}=snapshot;void contentDigest;snapshot.contentDigest=snapshotDigest(body);
 await expect(encodeDemoStore(altered)).rejects.toThrow();
 const legacy=structuredClone(getStore()),legacySnapshot=legacy.psp.snapshots![0];
 delete (legacySnapshot as unknown as {aggregateAuthorizationPolicy?:string}).aggregateAuthorizationPolicy;
 const {contentDigest:oldDigest,...legacyBody}=legacySnapshot;void oldDigest;legacySnapshot.contentDigest=snapshotDigest(legacyBody);
 const receipt=legacy.psp.commandReceipts.find(r=>(r.result as {data?:{id?:string}}).data?.id===legacySnapshot.id)!;
 (receipt.result as {data:PspServiceSnapshot}).data=structuredClone(legacySnapshot);
 installPspTestStore(legacy);const bytes=structuredClone(legacySnapshot);permission('legacy-withdraw','withdraw');
 expect(usable(legacySnapshot)).toBe(false);permission('legacy-regrant','grant');expect(usable(legacySnapshot)).toBe(false);
 const originalReceipt=structuredClone(getStore().psp.commandReceipts.find(r=>(r.result as {data?:{id?:string}}).data?.id===legacySnapshot.id));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0]).toEqual(bytes);expect(restored.psp.snapshots![0]).not.toHaveProperty('aggregateAuthorizationPolicy');
 expect(restored.psp.commandReceipts.find(r=>r.scopeKey===originalReceipt!.scopeKey)).toEqual(originalReceipt);
 const wrongDigest=structuredClone(getStore());(wrongDigest.psp.snapshots![0] as unknown as {aggregateAuthorizationPolicy:string}).aggregateAuthorizationPolicy='current_grants_v1';
 await expect(encodeDemoStore(wrongDigest)).rejects.toThrow();
});

it('later noncontributor aggregate withdrawal does not poison a frozen aggregate scope',()=>{
 const snapshot=freeze('noncontributor');
 const member=getStore().psp.enrollments.find(e=>e.id==='ENR-15')!;
 expect(snapshot.sources.some(s=>s.value.enrollmentId===member.id)).toBe(true);
 permission('noncontributor-withdraw','withdraw','aggregate',member.id,member.patientId);
 expect(usable(snapshot)).toBe(true);
});

it('restores an explicit historical no-policy fixture after withdrawal and rejects relabeling it as current grants',async()=>{
 permission('historical-fixture-withdraw','withdraw');
 const current=freeze('historical-fixture'),store=structuredClone(getStore()),snapshot=store.psp.snapshots![0];
 // Reconstruct the previous freeze contract directly; production has no opt-out.
 const graph=createSnapshotSourceGraph(snapshot.sources,{projectId,projectStartsAt:snapshot.project.startsAt,projectEndsAt:snapshot.project.endsAt,window:snapshot.window,sourceLedgerRevision:snapshot.sourceLedgerRevision});
 const historicalEvidence:SnapshotMetricEvidence[]=[];
 snapshot.aggregateMetrics=computePspMetrics(store.psp,{projectId,...snapshot.window,scope:'aggregate',ledgerRevision:snapshot.sourceLedgerRevision},(metricKey,cohortRefs,cohortQualifications=[])=>{
  historicalEvidence.push({scope:'aggregate',metricKey,cohortRefs,cohortQualifications,sourceRefs:[],supportingRefs:[]});
 });
 for(const m of snapshot.aggregateMetrics){
  let e=historicalEvidence.find(e=>e.metricKey===m.key);
  if(!e){e={scope:'aggregate',metricKey:m.key,cohortRefs:[],cohortQualifications:[],sourceRefs:[],supportingRefs:[]};historicalEvidence.push(e);}
  e.sourceRefs=[...m.sourceRefs];
  const witnessRefs=e.cohortQualifications.flatMap(q=>q.basis==='historical_result'?[q.sourceRef]:q.basis==='legacy_gap'&&q.firstTypedSourceRef?[q.firstTypedSourceRef]:[]);
  e.supportingRefs=graph.closure([...e.sourceRefs,...e.cohortRefs,...witnessRefs]).filter(ref=>!e.sourceRefs.includes(ref));
 }
 snapshot.evidence=[...snapshot.evidence.filter(e=>e.scope==='internal'),...historicalEvidence];
 snapshot.protectedMetrics=protectMetricGroups(snapshot.aggregateMetrics);delete snapshot.aggregateAuthorizationPolicy;
 const {contentDigest,...body}=snapshot;void contentDigest;snapshot.contentDigest=snapshotDigest(body);
 const receipt=store.psp.commandReceipts.find(r=>(r.result as {data?:{id?:string}}).data?.id===snapshot.id)!;(receipt.result as {data:PspServiceSnapshot}).data=structuredClone(snapshot);
 expect(metric(current,'period_members').value).toBe(13);expect(metric(snapshot,'period_members').value).toBe(14);
 installPspTestStore(store);expect(usable(snapshot)).toBe(false);permission('historical-fixture-regrant','grant');expect(usable(snapshot)).toBe(false);
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));expect(restored.psp.snapshots![0]).toEqual(snapshot);
 const forged=structuredClone(restored),copy=forged.psp.snapshots![0];copy.aggregateAuthorizationPolicy='current_grants_v1';
 const {contentDigest:old,...relabelled}=copy;void old;copy.contentDigest=snapshotDigest(relabelled);
 (forged.psp.commandReceipts.find(r=>(r.result as {data?:{id?:string}}).data?.id===copy.id)!.result as {data:PspServiceSnapshot}).data=structuredClone(copy);
 await expect(encodeDemoStore(forged)).rejects.toThrow('aggregate grant qualification');
});

it('projection binds occurrence, recording and sequence, removes every terminated grant, and preserves real history',()=>{
 const state=structuredClone(getStore().psp),original=JSON.stringify(state),grant=state.permissionEvents.find(e=>e.id==='PERM-01-aggregate')!;
 const revision=state.ledgerRevision;
 const repeat={...grant,id:'repeat-grant',sequence:revision+1,occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW};
 const withdrawal={...repeat,id:'same-clock-withdraw',sequence:revision+2,action:'withdraw' as const};
 const regrant={...repeat,id:'new-grant',sequence:revision+3};
 state.permissionEvents.push(repeat,withdrawal,regrant);state.ledgerRevision=revision+3;
 const options={asOf:PSP_TEST_NOW,maxSequence:state.ledgerRevision};
 const selected=resolveAggregateGrantProjection(state,options);
 expect(selected.permissionEvents.map(e=>e.id)).not.toContain(grant.id);expect(selected.permissionEvents.map(e=>e.id)).not.toContain(repeat.id);
 expect(selected.permissionEvents.map(e=>e.id)).toEqual(expect.arrayContaining([withdrawal.id,regrant.id,'PERM-01-service']));
 expect(resolveAggregateGrantProjection(state,{...options,maxSequence:revision+1}).permissionEvents.map(e=>e.id)).toEqual(expect.arrayContaining([grant.id,repeat.id]));
 for(const field of ['occurredAt','recordedAt'] as const){
  const hidden=structuredClone(state);hidden.permissionEvents.find(e=>e.id===withdrawal.id)![field]='2026-10-14T02:00:00.000Z';
  expect(resolveAggregateGrantProjection(hidden,options).permissionEvents.map(e=>e.id)).toEqual(expect.arrayContaining([grant.id,repeat.id]));
 }
 expect(JSON.stringify(getStore().psp)).toBe(original);
 expect(state.permissionEvents.map(e=>e.id)).toEqual(expect.arrayContaining([grant.id,repeat.id,withdrawal.id,regrant.id]));
 const historical=computePspMetrics(state,{projectId,...window,scope:'aggregate',ledgerRevision:state.ledgerRevision});
 expect(historical.find(m=>m.key==='contact_completion')!.denominator).toBe(14);
 expect(computePspMetrics(selected,{projectId,...window,scope:'aggregate',ledgerRevision:state.ledgerRevision}).find(m=>m.key==='contact_completion')!.denominator).toBe(13);
});
