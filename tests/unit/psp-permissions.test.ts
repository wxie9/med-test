import { beforeEach, describe, expect, it } from 'vitest';
import { buildPspTestStore, installPspTestStore, PSP_TEST_NOW } from '../helpers/psp';
import { getStore } from '@/lib/state/store';
import { permissionAt, recordPermission, recordEnrollmentState } from '@/lib/psp/permissions';
import { getPharmaProjectView } from '@/lib/psp/pharmaView';
import type { CommandMeta } from '@/lib/psp/types';
const meta = (id:string, expectedVersion=1, actorId='P-A', role:CommandMeta['role']='patient'):CommandMeta => ({seedVersion:getStore().seedVersion,expectedVersion,clientRequestId:id,actorId,role});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
describe('PSP authorizations and enrollment',()=>{
 it('withdraws aggregate independently, preserves historical grant and replays before CAS',()=>{
  const request=meta('withdraw-aggregate');
  const result=recordPermission('ENR-01','aggregate','withdraw',request);
  expect(permissionAt(getStore().psp,'ENR-01','service')).toBe(true);
  expect(permissionAt(getStore().psp,'ENR-01','aggregate')).toBe(false);
  expect(permissionAt(getStore().psp,'ENR-01','aggregate','2026-10-12T02:00:00.000Z')).toBe(true);
  expect(recordPermission('ENR-01','aggregate','withdraw',request)).toEqual(result);
  expect(getPharmaProjectView('PSP-BC-ENDO-001').allowedMembers).toEqual({status:'available',value:13});
  expect(()=>recordPermission('ENR-01','service','withdraw',request)).toThrow(/请求/);
 });
 it('service withdrawal pauses atomically without deleting plans',()=>{
  const before=getStore().psp.assignments;
  recordPermission('ENR-01','service','withdraw',meta('withdraw-service'));
  expect(getStore().psp.enrollments[0].status).toBe('paused');
  expect(getStore().psp.enrollments[0].version).toBe(2);
  expect(getStore().psp.assignments).toEqual(before);
  expect(permissionAt(getStore().psp,'ENR-01','aggregate')).toBe(true);
 });
 it('invited service grant does not activate; doctor confirms and manager activates future fixed plans',()=>{
  recordPermission('ENR-19','service','grant',meta('grant',1,'P-0040'));
  expect(getStore().psp.enrollments[18].status).toBe('invited');
  expect(getStore().psp.assignments).toHaveLength(54);
  expect(()=>recordEnrollmentState('ENR-19',{state:'active',reason:'加入'},meta('early',2,'case-manager-chen','case_manager'))).toThrow();
  recordEnrollmentState('ENR-19',{state:'invited',reason:'确认',eligibilityConfirmed:true},meta('confirm',2,'doctor-zhang','doctor'));
  recordEnrollmentState('ENR-19',{state:'active',reason:'加入'},meta('activate',3,'case-manager-chen','case_manager'));
  const plans=getStore().psp.assignments.filter(a=>a.enrollmentId==='ENR-19');
  expect(plans).toHaveLength(3);
  expect(plans.every(a=>a.id.endsWith('2026-11')&&a.dueAt>a.assignedAt)).toBe(true);
 });
 it('rejects wrong identity, stale version and stale seed without any change',()=>{
  const before=structuredClone(getStore().psp);
  expect(()=>recordPermission('ENR-01','service','withdraw',meta('other',1,'P-0040'))).toThrow();
  expect(()=>recordPermission('ENR-01','service','withdraw',meta('old',2))).toThrow();
  expect(()=>recordPermission('ENR-01','service','withdraw',{...meta('oldseed'),seedVersion:1_000_000})).toThrow();
  expect(getStore().psp).toEqual(before);
 });
});
