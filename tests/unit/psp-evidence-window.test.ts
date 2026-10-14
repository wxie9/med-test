import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {importLegacySelfReports} from '@/lib/psp/selfReport';
import {recordPermission,recordEnrollmentState} from '@/lib/psp/permissions';
import {wholeDayEligible,selectSelfReportSourcesAsOf,type EvidenceWindow} from '@/lib/psp/evidenceWindow';
import type {PspState,PspSelfReportRevision} from '@/lib/psp/types';
let state:PspState;
let options:EvidenceWindow;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;state=buildPspTestStore().psp;options={periodStart:state.project.startsAt,periodEnd:state.project.endsAt,cutoffAt:PSP_TEST_NOW,ledgerRevision:state.ledgerRevision,scope:'internal'};});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('includes whole authorized Shanghai days and excludes today, pre-project, malformed and partial-window dates',()=>{
 expect(wholeDayEligible(state,'ENR-01','2026-10-01',options)).toBe(true);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',options)).toBe(true);
 for(const date of ['2026-10-13','2026-09-30','2026-02-30','2026-10-32','garbage'])expect(wholeDayEligible(state,'ENR-01',date,options)).toBe(false);
 expect(wholeDayEligible(state,'ENR-19','2026-10-12',options)).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,periodStart:'2026-10-12T04:00:00Z'})).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,cutoffAt:'2026-10-13T00:00:00+08:00'})).toBe(true);
});
it('rejects intraday service withdrawal and regrant despite active permissions at both day endpoints',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 for(const [action,at] of [['withdraw','2026-10-12T03:00:00Z'],['grant','2026-10-12T04:00:00Z']] as const)state.permissionEvents.push({...base,id:action,action,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',options)).toBe(true);
});
it('rejects intraday membership pause and resume without deleting the preceding whole day',()=>{
 const base=state.membershipEvents.find(e=>e.enrollmentId==='ENR-01')!;
 for(const [status,at] of [['paused','2026-10-12T03:00:00Z'],['active','2026-10-12T04:00:00Z']] as const)state.membershipEvents.push({...base,id:status,status,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 const window={...options,ledgerRevision:state.ledgerRevision};
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',window)).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-11',window)).toBe(true);
});
it('rejects a same-timestamp service withdrawal and regrant but ignores transitions beyond the requested revision',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 const at='2026-10-12T03:00:00Z';
 for(const action of ['withdraw','grant'] as const)state.permissionEvents.push({...base,id:action,action,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',options)).toBe(true);
});
it('rejects a same-timestamp membership pause and resume while service remains granted',()=>{
 const base=state.membershipEvents.find(e=>e.enrollmentId==='ENR-01')!;
 const at='2026-10-12T03:00:00Z';
 for(const status of ['paused','active'] as const)state.membershipEvents.push({...base,id:status,status,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(false);
 expect(wholeDayEligible(state,'ENR-01','2026-10-11',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
});
it('rejects same-timestamp aggregate withdrawal and regrant only for aggregate evidence',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='aggregate')!;
 const at='2026-10-12T03:00:00Z';
 for(const action of ['withdraw','grant'] as const)state.permissionEvents.push({...base,id:action,action,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 const window={...options,ledgerRevision:state.ledgerRevision};
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',window)).toBe(true);
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...window,scope:'aggregate'})).toBe(false);
});
it('uses the final midnight state and assigns a next-midnight interruption to the following day',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 for(const at of ['2026-10-12T00:00:00+08:00','2026-10-13T00:00:00+08:00'])for(const action of ['withdraw','grant'] as const)state.permissionEvents.push({...base,id:`${action}-${at}`,action,occurredAt:at,recordedAt:at,sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
 const membership=state.membershipEvents.find(e=>e.enrollmentId==='ENR-01')!;
 state.membershipEvents.push({...membership,id:'next-midnight-pause',status:'paused',occurredAt:'2026-10-13T00:00:00+08:00',recordedAt:'2026-10-13T00:00:00+08:00',sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
 expect(wholeDayEligible(state,'ENR-01','2026-10-13',{...options,cutoffAt:'2026-10-14T02:00:00Z',ledgerRevision:state.ledgerRevision})).toBe(false);
});
it('checks a same-effective-time interruption when recorded late and excludes events unknown at cutoff',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 for(const action of ['withdraw','grant'] as const)state.permissionEvents.push({...base,id:action,action,occurredAt:'2026-10-12T02:00:00Z',recordedAt:'2026-10-12T03:00:00Z',sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(false);
 for(const event of state.permissionEvents.filter(e=>e.id==='withdraw'||e.id==='grant'))event.recordedAt='2026-10-14T02:00:00Z';
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
 // A later cutoff knows the event, but it became effective after this completed day.
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,cutoffAt:'2026-10-15T02:00:00Z',ledgerRevision:state.ledgerRevision})).toBe(true);
});
it('retains earlier effective states with higher sequences when a backdated event becomes known later',()=>{
 const membership=state.membershipEvents.find(e=>e.enrollmentId==='ENR-01')!;
 const service=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 membership.status='invited';
 // This low-sequence service event becomes effective after the higher-sequence activation.
 state.permissionEvents.push({...service,id:'late-service',occurredAt:'2026-10-12T02:00:00Z',recordedAt:'2026-10-12T04:00:00Z',sequence:++state.ledgerRevision});
 state.membershipEvents.push({...membership,id:'midnight-active',status:'active',occurredAt:'2026-10-12T00:00:00+08:00',recordedAt:'2026-10-12T00:00:00+08:00',sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
});
it('does not treat a superseded backdated withdrawal as a new effective interruption',()=>{
 const base=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;
 state.permissionEvents.push({...base,id:'midnight-grant',occurredAt:'2026-10-12T00:00:00+08:00',recordedAt:'2026-10-12T00:00:00+08:00',sequence:++state.ledgerRevision});
 state.permissionEvents.push({...base,id:'superseded-withdrawal',action:'withdraw',occurredAt:'2026-10-11T03:00:00Z',recordedAt:'2026-10-12T03:00:00Z',sequence:++state.ledgerRevision});
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,ledgerRevision:state.ledgerRevision})).toBe(true);
});
it('imports only eleven completed days after real same-clock service withdrawal, regrant and member reactivation',()=>{
 installPspTestStore(buildPspTestStore());
 process.env.DEMO_FIXED_NOW='2026-10-12T03:00:00.000Z';
 const meta=(id:string,role:'patient'|'case_manager')=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments[0].version,clientRequestId:id,role,actorId:role==='patient'?'P-A':'case-manager-chen'});
 recordPermission('ENR-01','service','withdraw',meta('same-clock-withdraw','patient'));
 recordPermission('ENR-01','service','grant',meta('same-clock-grant','patient'));
 recordEnrollmentState('ENR-01',{state:'active',reason:'恢复项目服务'},meta('same-clock-resume','case_manager'));
 process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 const result=importLegacySelfReports('ENR-01',meta('same-clock-import','case_manager'));
 expect(result.data.importedCount).toBe(11);
 expect(getStore().psp.selfReportRevisions?.some(r=>r.logDate==='2026-10-12')).toBe(false);
});
it('requires whole-day aggregate permission, excludes first-grant boundary and is independent of host clock',()=>{
 expect(wholeDayEligible(state,'ENR-15','2026-10-12',options)).toBe(true);
 expect(wholeDayEligible(state,'ENR-15','2026-10-12',{...options,scope:'aggregate'})).toBe(false);
 const grant=state.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='aggregate')!;grant.occurredAt='2026-10-12T04:00:00Z';grant.recordedAt=grant.occurredAt;
 expect(wholeDayEligible(state,'ENR-01','2026-10-12',{...options,scope:'aggregate'})).toBe(false);
 process.env.DEMO_FIXED_NOW='2050-01-01T00:00:00Z';
 expect(wholeDayEligible(state,'ENR-01','2026-10-11',options)).toBe(true);
});
const source=(id:string,precision:'date_only'|'instant',date:string,at:string|null):PspSelfReportRevision=>({sourceId:id,projectId:state.project.id,enrollmentId:'ENR-01',logDate:date,due:1,taken:1,reason:null,precision,occurredAt:at,recordedAt:PSP_TEST_NOW,actorId:precision==='instant'?'P-A':'case-manager-chen',sequence:++state.ledgerRevision,sourceHash:'a'.repeat(64)});
it('selects copied whole-day values and exact today by cutoff/sequence, without rereading mutable clinical rows',()=>{
 const yesterday=source('legacy','date_only','2026-10-12',null),today=source('today-date-only','date_only','2026-10-13',null),instant=source('first','instant','2026-10-13',PSP_TEST_NOW);
 state.selfReportRevisions=[yesterday,today,instant];
 const selected=selectSelfReportSourcesAsOf(state,'ENR-01',{...options,ledgerRevision:state.ledgerRevision});
 expect(selected.map(r=>r.sourceId)).toEqual(['legacy','first']);
 selected[0].taken=0;expect(yesterday.taken).toBe(1);
 expect(selectSelfReportSourcesAsOf(state,'ENR-02',{...options,ledgerRevision:state.ledgerRevision})).toEqual([]);
});
it('keeps old values for an earlier revision/cutoff and prefers latest precise revisions over same-day legacy',()=>{
 const old=source('old','instant','2026-10-12','2026-10-12T02:00:00Z');old.recordedAt=old.occurredAt!;
 const fixed=source('new','instant','2026-10-12','2026-10-12T03:00:00Z');fixed.recordedAt=fixed.occurredAt!;fixed.taken=0;fixed.reason='忘记';fixed.revisionOf=old.sourceId;
 const legacy=source('legacy','date_only','2026-10-12',null);state.selfReportRevisions=[old,fixed,legacy];
 expect(selectSelfReportSourcesAsOf(state,'ENR-01',{...options,ledgerRevision:state.ledgerRevision}).map(r=>r.sourceId)).toEqual(['new']);
 expect(selectSelfReportSourcesAsOf(state,'ENR-01',{...options,ledgerRevision:old.sequence}).map(r=>r.sourceId)).toEqual(['old']);
 expect(selectSelfReportSourcesAsOf(state,'ENR-01',{...options,cutoffAt:'2026-10-12T02:30:00Z',ledgerRevision:state.ledgerRevision}).map(r=>r.sourceId)).toEqual(['old']);
});
it('excludes late imports and does not grant same-clock aggregate permission retrospectively',()=>{
 const legacy=source('late','date_only','2026-10-12',null);legacy.recordedAt='2026-10-14T02:00:00Z';
 state.permissionEvents=state.permissionEvents.filter(e=>!(e.enrollmentId==='ENR-01'&&e.scope==='aggregate'));
 const exact=source('exact','instant','2026-10-13',PSP_TEST_NOW);state.selfReportRevisions=[legacy,exact];
 state.permissionEvents.push({id:'new-grant',enrollmentId:'ENR-01',scope:'aggregate',action:'grant',textVersion:'v1',actorId:'P-A',occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW,sequence:++state.ledgerRevision});
 expect(selectSelfReportSourcesAsOf(state,'ENR-01',{...options,ledgerRevision:state.ledgerRevision}).map(r=>r.sourceId)).toEqual(['exact']);
 expect(selectSelfReportSourcesAsOf(state,'ENR-01',{...options,scope:'aggregate',ledgerRevision:state.ledgerRevision})).toEqual([]);
});
it('selects the real fixed-clock imported cohort as 216/199 internal and 168/153 aggregate',()=>{
 installPspTestStore(buildPspTestStore());
 for(const enrollment of getStore().psp.enrollments.filter(e=>e.status==='active'))importLegacySelfReports(enrollment.id,{seedVersion:getStore().seedVersion,expectedVersion:enrollment.version,clientRequestId:`import-${enrollment.id}`,role:'case_manager',actorId:'case-manager-chen'});
 state=getStore().psp;
 const rows=(scope:'internal'|'aggregate')=>state.enrollments.flatMap(e=>selectSelfReportSourcesAsOf(state,e.id,{...options,scope,ledgerRevision:state.ledgerRevision}));
 const internal=rows('internal'),aggregate=rows('aggregate');
 expect(internal).toHaveLength(216);expect(internal.reduce((n,r)=>n+r.due,0)).toBe(216);expect(internal.reduce((n,r)=>n+r.taken,0)).toBe(199);
 expect(aggregate).toHaveLength(168);expect(aggregate.reduce((n,r)=>n+r.due,0)).toBe(168);expect(aggregate.reduce((n,r)=>n+r.taken,0)).toBe(153);
 expect(internal.every(r=>r.logDate<'2026-10-13'&&r.occurredAt===null)).toBe(true);
});
