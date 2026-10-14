import { expect, test } from 'vitest';
import { getStore, resetStore, serialize, serializeLite } from '@/lib/state/store';
test('independent PSP fixture has exact 20/18/14 membership and 54 fixed plans', () => {
 resetStore(); const s=getStore(); expect(s.psp.enrollments).toHaveLength(20);
 expect(s.psp.enrollments.filter(e=>e.status==='active')).toHaveLength(18);
 expect(s.psp.permissionEvents.filter(e=>e.scope==='aggregate')).toHaveLength(14);
 expect(s.psp.assignments).toHaveLength(54);
 expect(s.psp.assignments.filter(a=>a.kind==='questionnaire').every(a=>a.status==='open' && a.firstValidSubmittedAt===null)).toBe(true);
 expect(serialize(s)).not.toHaveProperty('psp'); expect(serializeLite(s)).not.toHaveProperty('psp');
});

test('reset restores independent fixture and old HMR stores advance seed generation',()=>{
 resetStore(); const s=getStore(); const before=s.seedVersion; s.psp.enrollments[0].status='paused'; resetStore();expect(getStore().psp.enrollments[0].status).toBe('active');
 const globals=globalThis as unknown as {__demoStore?:unknown};const old={...getStore()};delete (old as Partial<typeof old>).psp;globals.__demoStore=old;
 expect(getStore().psp.enrollments).toHaveLength(20);expect(getStore().seedVersion).toBeGreaterThan(before);
});

test('fixture uses the exact fixed members, independent outcomes and fixed deadlines',()=>{
 resetStore();const s=getStore();expect(s.psp.enrollments.map(e=>e.patientId)).toEqual(['P-A','P-0002','P-0004','P-0006','P-0009','P-0011','P-0013','P-0016','P-0018','P-0024','P-0025','P-0028','P-0029','P-0030','P-0032','P-0033','P-0035','P-0036','P-0040','P-0042']);
 expect(s.psp.serviceEvents.filter(e=>e.outcome==='reached').map(e=>e.enrollmentId)).toEqual(['ENR-02','ENR-03','ENR-04','ENR-05','ENR-06','ENR-07','ENR-08','ENR-09','ENR-15','ENR-16']);expect(s.psp.educationResults).toHaveLength(10);
 for(const a of s.psp.assignments){expect(a.id).toBe(`PSP-BC-ENDO-001:${a.enrollmentId}:${{questionnaire:'PRO',contact:'CONTACT',education:'EDUCATION'}[a.kind]}:2026-10`);expect(a.dueAt).toBe({questionnaire:'2026-10-13T01:00:00.000Z',contact:'2026-10-08T01:00:00.000Z',education:'2026-10-10T01:00:00.000Z'}[a.kind]);}
 expect(s.psp.assignments.some(a=>['ENR-19','ENR-20'].includes(a.enrollmentId))).toBe(false);expect(s.alerts).toHaveLength(0);expect(s.tasks).toHaveLength(0);
 for(const e of s.psp.educationResults){expect(Date.parse(e.sentAt)).toBeGreaterThanOrEqual(Date.parse(s.psp.educationContents[0].approvedAt));expect(s.psp.permissionEvents.some(p=>p.enrollmentId===s.psp.assignments.find(a=>a.id===e.assignmentId)?.enrollmentId&&p.scope==='service'&&Date.parse(p.occurredAt)<=Date.parse(e.sentAt))).toBe(true);}
});
