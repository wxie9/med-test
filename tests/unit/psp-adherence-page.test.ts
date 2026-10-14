// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AdherencePage from '@/app/patient/adherence/page';
let query=new URLSearchParams('enrollment=ENR-1');
const clinical=vi.fn(()=>({data:{today:'2026-10-13',patient:{adherence:[]}},error:null,refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>query}));
vi.mock('@/lib/client/patientContext',()=>({usePatientId:()=> 'P-A'}));
vi.mock('@/lib/client/usePatient',()=>({usePatient:()=>clinical()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();clinical.mockClear();query=new URLSearchParams('enrollment=ENR-1');});
it('invalid enrollment never loads or falls back to generic clinical adherence',async()=>{
 vi.stubGlobal('fetch',()=>Promise.resolve(new Response('{}',{status:404})));render(createElement(AdherencePage));await screen.findByText(/项目服药记录无法加载/);expect(clinical).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'今日已服'})).toBeNull();
});
it('an explicit empty enrollment is invalid and never becomes a generic check-in',()=>{
 query=new URLSearchParams('enrollment=');vi.stubGlobal('fetch',()=>Promise.resolve(new Response('{}',{status:404})));render(createElement(AdherencePage));expect(screen.getByRole('alert').textContent).toContain('项目成员参数无效');expect(clinical).not.toHaveBeenCalled();
});
it('no enrollment retains original clinical endpoint and UI',async()=>{
 query=new URLSearchParams();render(createElement(AdherencePage));await waitFor(()=>expect(screen.getByRole('button',{name:'今日已服'})).toBeTruthy());expect(clinical).toHaveBeenCalled();expect(screen.getByText('近 60 天服药记录')).toBeTruthy();expect(screen.queryByTestId('psp-project-adherence')).toBeNull();
});
