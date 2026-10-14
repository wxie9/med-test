import {beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {submitProjectPro} from '@/lib/psp/commands';
import {getPatientServiceView} from '@/lib/psp/serviceView';
import {getPatientProjectsView} from '@/lib/psp/views';
const projectId='PSP-BC-ENDO-001';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it('projects only this member service evidence and rejects patient/pharma/missing staff identity',()=>{
 for(const [role,actor] of [[null,null],['patient','P-A'],['pharma_owner','pharma-owner-a'],['doctor','case-manager-chen']])expect(()=>getPatientServiceView(projectId,'P-A',role,actor)).toThrow();
 const view=getPatientServiceView(projectId,'P-A','case_manager','case-manager-chen');
 expect(view.displayName).toBe('王女士');expect(view.contacts).toHaveLength(1);expect(view.contacts[0].background).toBe(true);expect(view.alerts).toEqual([]);
 expect(view.education).toHaveLength(1);expect(view.education[0].sentAt).toBeNull();
 expect(JSON.stringify(view)).not.toContain('P-0002');expect(()=>getPatientServiceView(projectId,'P-B','doctor','doctor-zhang')).toThrow();
});
it('includes all questionnaire revision alerts with no inferred medical review from clinical status',()=>{
 const id=`${projectId}:ENR-01:PRO:2026-10`,input={assignmentId:id,patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4}};
 const meta={seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'first',actorId:'P-A',role:'patient' as const};
 const first=submitProjectPro(input,meta);submitProjectPro({...input,revisionOf:first.data.proId},{...meta,expectedVersion:2,clientRequestId:'revision'});
 getStore().alerts[0].status='closed';
 const view=getPatientServiceView(projectId,'P-A','doctor','doctor-zhang');
 expect(view.alerts).toHaveLength(4);expect(view.alerts.every(a=>a.disposition===null&&a.doctorReview===null)).toBe(true);
 const own=getPatientProjectsView('P-A','patient','P-A');expect(own.projects[0].education?.[0].contentVersionId).toBeNull();
});
