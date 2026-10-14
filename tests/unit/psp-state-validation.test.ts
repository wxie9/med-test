import { expect, test } from 'vitest';
import { buildPspTestStore } from '@/tests/helpers/psp';
import { validatePspState } from '@/lib/psp/types';
const fresh=()=>buildPspTestStore().psp;
test('rejects materialized status that disagrees with the complete membership ledger',()=>{const s=fresh();s.enrollments[0].status='paused';expect(()=>validatePspState(s)).toThrow();});
test('requires active eligibility and current service grant',()=>{
 const s=fresh();s.enrollments[0].eligibilityConfirmed=false;s.enrollments[0].eligibilityConfirmedAt=null;s.enrollments[0].eligibilityConfirmedBy=null;expect(()=>validatePspState(s)).toThrow();
 const noGrant=fresh();noGrant.permissionEvents=noGrant.permissionEvents.filter(e=>e.enrollmentId!=='ENR-01'||e.scope!=='service');expect(()=>validatePspState(noGrant)).toThrow();
});
test('uses epoch then sequence without filtering by machine now or array order',()=>{
 const s=fresh();const sequence=++s.ledgerRevision;s.membershipEvents.unshift({id:'future-pause',enrollmentId:'ENR-01',status:'paused',reason:'future persisted event',occurredAt:'2099-01-01T00:00:00.000Z',recordedAt:'2099-01-01T00:00:00.000Z',actorId:'case-manager-chen',sequence});
 expect(()=>validatePspState(s)).toThrow();s.enrollments[0].status='paused';expect(()=>validatePspState(s)).not.toThrow();
 const tie=fresh();tie.permissionEvents.unshift({...tie.permissionEvents[0],id:'withdraw-new',action:'withdraw',sequence:++tie.ledgerRevision});expect(()=>validatePspState(tie)).toThrow();
});
test('rejects contact and education facts before assignment',()=>{
 const s=fresh();s.serviceEvents[0].occurredAt='2026-09-29T00:00:00.000Z';expect(()=>validatePspState(s)).toThrow();
 const edu=fresh();edu.educationResults[0].sentAt='2026-09-29T01:00:00.000Z';expect(()=>validatePspState(edu)).toThrow();
});
test('rejects receipt revisions ahead of state but allows eligibility confirmation before project start',()=>{
 const s=fresh();s.commandReceipts.push({id:'r',scopeKey:'test',bodyDigest:'digest',result:{},objectVersion:1,ledgerRevision:s.ledgerRevision+1});expect(()=>validatePspState(s)).toThrow();
 const valid=fresh();valid.enrollments[0].eligibilityConfirmedAt='2026-09-01T00:00:00.000Z';expect(()=>validatePspState(valid)).not.toThrow();
});

test('epoch order outranks sequence and unknown member history is rejected',()=>{
 const s=fresh();s.membershipEvents.push({id:'older-record',enrollmentId:'ENR-01',status:'paused',reason:'older fact recorded later',occurredAt:'2026-09-01T00:00:00.000Z',recordedAt:'2026-10-14T00:00:00.000Z',actorId:'case-manager-chen',sequence:++s.ledgerRevision});expect(()=>validatePspState(s)).not.toThrow();
 s.membershipEvents=s.membershipEvents.filter(e=>e.enrollmentId!=='ENR-01');expect(()=>validatePspState(s)).toThrow();
});
test('v2 recovery rejects a syntactically valid snapshot with inconsistent membership',async()=>{
 const {decodeDemoStore}=await import('@/lib/state/persistence');const store=buildPspTestStore();store.psp.enrollments[0].status='paused';
 const body={version:2,store:{...store,patients:[...store.patients.values()]}};
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(body)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 await expect(decodeDemoStore(bytes)).rejects.toThrow('membership ledger');
});
