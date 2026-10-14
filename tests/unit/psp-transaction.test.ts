import {beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore,resetStore} from '@/lib/state/store';
import {transact} from '@/lib/psp/transaction';
import {recordEnrollmentState,recordPermission} from '@/lib/psp/permissions';
import type {CommandMeta} from '@/lib/psp/types';
const meta=(id:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:id,role:'case_manager',actorId:'case-manager-chen'});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it('rolls back mutation exceptions and invalid drafts without touching clinical or PSP state',()=>{
 const original=getStore();const before=structuredClone(original);
 expect(()=>transact('ENR-01',{},meta('throw'),['case_manager'],(s,e)=>{e.status='exited';s.tasks=[];throw Error('fail');})).toThrow('fail');
 expect(getStore()).toBe(original);expect(getStore()).toEqual(before);
 expect(()=>transact('ENR-01',{},meta('invalid'),['case_manager'],s=>{s.psp.assignments[0].dueAt='invalid';return {};})).toThrow();
 expect(getStore()).toEqual(before);
});
it('rejects manager eligibility confirmation and irreversible exit reactivation; preserves original followup',()=>{
 const tasks=structuredClone(getStore().tasks),plans=structuredClone(getStore().psp.assignments);
 expect(()=>recordEnrollmentState('ENR-01',{state:'active',reason:'确认',eligibilityConfirmed:true},meta('confirm'))).toThrow();
 recordEnrollmentState('ENR-01',{state:'exited',reason:'患者申请退出'},meta('exit'));
 expect(()=>recordEnrollmentState('ENR-01',{state:'active',reason:'重新激活'},{...meta('resume'),expectedVersion:2})).toThrow();
 expect(getStore().tasks).toEqual(tasks);expect(getStore().psp.assignments).toEqual(plans);
});
it('old receipt cannot be replayed after reset',()=>{
 const request={...meta('old'),role:'patient' as const,actorId:'P-A'};
 recordPermission('ENR-01','service','withdraw',request);resetStore();
 expect(()=>recordPermission('ENR-01','service','withdraw',request)).toThrow(/重置/);
 expect(getStore().psp.enrollments[0].status).toBe('active');
});
