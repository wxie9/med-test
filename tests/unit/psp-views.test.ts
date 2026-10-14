import {beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {getPatientProjectsView,getInternalProjectView} from '@/lib/psp/views';
import {getPharmaProjectView} from '@/lib/psp/pharmaView';
import {recordPermission,membershipAt,permissionAt} from '@/lib/psp/permissions';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it('clinical research consent never grants independent PSP permission and nonmember has empty view',()=>{
 const s=getStore();s.patients.get('P-0040')!.consent.pharmaDeidentified=true;
 expect(getPatientProjectsView('P-0040','patient','P-0040').projects[0].permissions).toEqual({service:false,aggregate:false});
 expect(getPatientProjectsView('P-B','patient','P-B').projects).toEqual([]);
});
it('suppresses all small and empty current aggregates without exact value',()=>{
 for(let i=0;i<14;i++) {
  const e=getStore().psp.enrollments[i];
  recordPermission(e.id,'aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:e.version,clientRequestId:`withdraw-${i}`,role:'patient',actorId:e.patientId});
  const dto=getPharmaProjectView('PSP-BC-ENDO-001');
  if(i===9) expect(dto.allowedMembers).toEqual({status:'suppressed',reason:expect.any(String)});
  if(i===13) expect(dto.allowedMembers).toEqual({status:'no_applicable',reason:expect.any(String)});
 }
});
it('uses ledger and recorded time boundaries at equal event time',()=>{
 const s=getStore().psp,revision=s.ledgerRevision;
 recordPermission('ENR-01','service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'same-time',role:'patient',actorId:'P-A'});
 const changed=getStore().psp;
 expect(permissionAt(changed,'ENR-01','service',PSP_TEST_NOW,revision)).toBe(true);
 expect(membershipAt(changed,'ENR-01',PSP_TEST_NOW,revision)).toBe('active');
 expect(membershipAt(changed,'ENR-01',PSP_TEST_NOW)).toBe('paused');
 const withdrawn=changed.permissionEvents.at(-1)!;withdrawn.recordedAt='2026-10-14T02:00:00.000Z';
 expect(permissionAt(changed,'ENR-01','service',PSP_TEST_NOW)).toBe(true);
});
it('internal and patient views are fresh projections rather than mutable store aliases',()=>{
 const view=getInternalProjectView('PSP-BC-ENDO-001','doctor','doctor-zhang');
 view.project.contactTargets.high=999;view.enrollments[0].status='exited';
 const own=getPatientProjectsView('P-A','patient','P-A');own.projects[0].permissionHistory[0].action='withdraw';
 expect(getStore().psp.project.contactTargets.high).toBe(2);
 expect(getStore().psp.enrollments[0].status).toBe('active');
 expect(permissionAt(getStore().psp,'ENR-01','service')).toBe(true);
});
