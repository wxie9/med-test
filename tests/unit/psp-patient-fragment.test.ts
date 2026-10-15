// @vitest-environment jsdom
import {createElement} from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePatientFragment} from '@/components/psp/usePatientFragment';
const first='assignment-PSP:ENR:PRO:1',second='assignment-PSP:ENR:EDU:1';
function Targets({patientId='P-A',seed=1,ids=[first,second]}:{patientId?:string;seed?:number|null;ids?:string[]}){
 usePatientFragment(patientId,seed??undefined,ids);
 return createElement('div',null,...ids.map(id=>createElement('li',{id,key:id,tabIndex:-1},id)),createElement('button',{key:'continue'},'continue'));
}
afterEach(()=>{cleanup();vi.restoreAllMocks();window.history.replaceState(null,'','/');});
function prepare(hash:string){window.history.replaceState(null,'',`/plan#${encodeURIComponent(hash)}`);const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});return scroll;}
it('same-patient polls and a new seed do not steal focus after the fragment was consumed',()=>{
 const scroll=prepare(first);const {rerender,getByRole}=render(createElement(Targets));expect(document.activeElement?.id).toBe(first);getByRole('button').focus();
 rerender(createElement(Targets,{ids:[first,second]}));rerender(createElement(Targets,{seed:2,ids:[first,second]}));expect(document.activeElement).toBe(getByRole('button'));expect(scroll).toHaveBeenCalledTimes(1);
});
it('an initially unauthorized hash is retired rather than revived by later polls',()=>{
 const scroll=prepare(second);const {rerender,getByRole}=render(createElement(Targets,{ids:[first]}));getByRole('button').focus();rerender(createElement(Targets,{ids:[first,second]}));expect(document.activeElement).toBe(getByRole('button'));expect(scroll).not.toHaveBeenCalled();
});
it('each new hash navigation may reach its own exact authorized target once',()=>{
 const scroll=prepare(first);const {rerender,getByRole}=render(createElement(Targets));expect(document.activeElement?.id).toBe(first);getByRole('button').focus();
 act(()=>{window.history.replaceState(null,'',`/plan#${encodeURIComponent(second)}`);window.dispatchEvent(new HashChangeEvent('hashchange'));});expect(document.activeElement?.id).toBe(second);getByRole('button').focus();rerender(createElement(Targets));expect(document.activeElement).toBe(getByRole('button'));expect(scroll).toHaveBeenCalledTimes(2);
});
it('a patient switch with no current DTO cannot reach the previous patient target',()=>{
 const scroll=prepare(first);const {rerender,getByRole}=render(createElement(Targets));getByRole('button').focus();rerender(createElement(Targets,{patientId:'P-B',seed:null,ids:[]}));expect(scroll).toHaveBeenCalledTimes(1);expect(document.getElementById(first)).toBeNull();
});
