// @vitest-environment jsdom
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PharmaReportReadingHeader,PharmaReportEvidence} from '@/components/psp/PharmaReportReading';
import {publicReportFixture} from './helpers/pharmaReadingFixtures';
import {formatPspTime} from '@/components/psp/Common';
import type {NextAction} from '@/lib/psp/reportTypes';
const links={text:'/fixed?format=text',html:'/fixed?format=html'};
const evidence=(report=publicReportFixture())=>render(createElement(PharmaReportEvidence,{report,downloadLinks:links,onRefresh:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.history.replaceState(null,'','/');});
it.each([['delivered','已交付，待客户反馈'],['accepted','客户已验收'],['client_changes_requested','客户已请求修改']] as const)('uses current %s status ahead of generation history', (status,label)=>{
 const report=publicReportFixture({status});render(createElement(PharmaReportReadingHeader,{report,onRefresh:vi.fn()}));
 expect(screen.getByRole('heading',{name:`${label} · 修订 1`})).toBeTruthy();
 expect(screen.getByTestId('psp-pharma-reading-summary')).toBeTruthy();
 expect(screen.queryByText('模板草稿，待人工审核')).toBeNull();
 expect(screen.getByText(`阶段数据：${formatPspTime(report.window.periodStart)} 至 ${formatPspTime(report.window.cutoffAt)}（上海时间）`)).toBeTruthy();
 expect(screen.queryByText(report.contentDigest,{exact:false})).toBeNull();
});
it('shows each protected fact state without dormant numbers or derived percentages',()=>{
 const report=publicReportFixture();const keys=['questionnaire_completion','contact_completion','education_completion','service_completion'];
 for(const chapter of report.content.chapters) chapter.facts=chapter.facts.map(fact=>{
  const i=keys.indexOf(fact.metricKey);return i<0?fact:{...fact,status:(['suppressed','available','unknown','no_applicable'] as const)[i],value:i===1?9/14:999,numerator:i===1?9:999,denominator:i===1?14:999,sampleN:i===1?14:999};
 });
 render(createElement(PharmaReportReadingHeader,{report,onRefresh:vi.fn()}));
 const summary=screen.getByTestId('psp-pharma-reading-summary');
 for(const text of ['已保护 · 本项不展示精确结果','9 / 14 · 适用样本 14','证据不足 · 本项暂不能判断','本阶段无适用样本'])expect(summary.textContent).toContain(text);
 expect(summary.outerHTML).not.toMatch(/999|64.29|已达标|period_members/);
});
it('keeps a real zero and offers an explicit refresh when another fact is missing',()=>{
 const report=publicReportFixture();for(const chapter of report.content.chapters)chapter.facts=chapter.facts.filter(f=>f.metricKey!=='contact_completion').map(f=>f.metricKey==='questionnaire_completion'?{...f,status:'available',value:0}:f);
 const refresh=vi.fn();render(createElement(PharmaReportReadingHeader,{report,onRefresh:refresh}));
 expect(screen.getByText('0 份')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'重新核对报告数据'}));expect(refresh).toHaveBeenCalledTimes(1);
});
it('explains empty next actions without treating old generation prose as current state',()=>{
 render(createElement(PharmaReportReadingHeader,{report:publicReportFixture(),onRefresh:vi.fn()}));
 expect(screen.getByTestId('psp-pharma-next-actions').textContent).toContain('本版未列下一期服务安排');
});
it.each([1,12])('presents %i actual next actions as plans, preserving role, time and status',count=>{
 const nextActions:NextAction[]=Array.from({length:count},(_,i)=>({category:'medical_review',responsibleRole:'doctor',dueAt:'2026-10-14T03:30:00.000Z',status:i%2?'in_progress':'planned'}));
 render(createElement(PharmaReportReadingHeader,{report:publicReportFixture({nextActions}),onRefresh:vi.fn()}));
 const section=screen.getByTestId('psp-pharma-next-actions');expect(within(section).getAllByRole('listitem')).toHaveLength(count);
 expect(section.textContent).toContain('医学复核');expect(section.textContent).toContain('医生');expect(section.textContent).toContain('11:30:00');expect(section.textContent).toContain('计划安排');
 if(count===12)expect(section.textContent).toContain('安排进行中');expect(section.textContent).not.toContain('已完成');
});
it('retains all seven chapters and 40 unique metrics and their original definitions',()=>{
 const report=publicReportFixture();const before=structuredClone(report);evidence(report);
 expect(screen.queryByTestId('psp-pharma-report-content')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'展开完整报告'}));
 const body=screen.getByTestId('psp-pharma-report-content');expect(within(body).getAllByRole('heading',{level:3})).toHaveLength(7);
 const facts=report.content.chapters.flatMap(chapter=>chapter.facts);expect(facts).toHaveLength(40);
 for(const fact of facts){const row=within(body).getByTestId(`psp-report-fact-${fact.metricKey}`);fireEvent.click(within(row).getByRole('button',{name:`查看口径：${fact.label}`}));expect(within(row).getByText(fact.definition).hidden).toBe(false);}
 fireEvent.click(within(body).getByRole('button',{name:'收起章节：服务执行'}));expect(within(body).getByRole('button',{name:'展开章节：服务执行'}).getAttribute('aria-expanded')).toBe('false');
 expect(report).toEqual(before);
});
it('keeps generation notice and full audit material collapsed and downloadable originals unchanged',()=>{
 const report=publicReportFixture();evidence(report);
 expect(screen.queryByText(report.content.notice)).toBeNull();expect(screen.queryByText(`内容校验码：${report.contentDigest}`)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'原文生成记录'}));expect(screen.getByText(report.content.notice)).toBeTruthy();expect(screen.getByText(/以下是生成时原始文字/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'核对资料'}));expect(screen.getByText(`内容校验码：${report.contentDigest}`)).toBeTruthy();expect(screen.getByText(`文件校验码：${report.artifact.digest}`)).toBeTruthy();
 expect(screen.getByRole('link',{name:'下载固定文本'}).getAttribute('href')).toBe(links.text);expect(screen.getByRole('link',{name:'下载固定HTML'}).getAttribute('href')).toBe(links.html);
});
it('reveals an initial body anchor and handles same-hash clicks without refocusing on data polling',async()=>{
 const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});
 window.history.replaceState(null,'','/#public-report-body');const report=publicReportFixture();const view=evidence(report);
 await waitFor(()=>expect(screen.getByTestId('psp-pharma-report-content')).toBeTruthy());await waitFor(()=>expect(document.activeElement?.id).toBe('public-report-body-heading'));
 fireEvent.click(screen.getByRole('button',{name:'收起完整报告'}));expect(screen.queryByTestId('psp-pharma-report-content')).toBeNull();
 const link=document.createElement('a');link.href='#public-report-body';document.body.append(link);fireEvent.click(link);await screen.findByTestId('psp-pharma-report-content');link.remove();
 const button=screen.getByRole('button',{name:'收起完整报告'});await waitFor(()=>expect(document.activeElement?.id).toBe('public-report-body-heading'));button.focus();
 view.rerender(createElement(PharmaReportEvidence,{report:structuredClone(report),downloadLinks:links,onRefresh:vi.fn()}));await act(async()=>{});expect(document.activeElement).toBe(button);
});
it('opens a body hashchange from the default reading state',async()=>{
 evidence();expect(screen.queryByTestId('psp-pharma-report-content')).toBeNull();
 await act(async()=>{window.history.pushState(null,'','/#public-report-body');window.dispatchEvent(new HashChangeEvent('hashchange'));});
 expect(screen.getByTestId('psp-pharma-report-content')).toBeTruthy();
});
it('keeps each disclosure aria-controls target present even while protected contents are collapsed',()=>{
 evidence();
 for(const button of screen.getAllByRole('button')){const id=button.getAttribute('aria-controls');if(id)expect(document.getElementById(id)).not.toBeNull();}
 fireEvent.click(screen.getByRole('button',{name:'展开完整报告'}));
 fireEvent.click(screen.getByRole('button',{name:'收起章节：服务执行'}));
 for(const button of screen.getAllByRole('button')){const id=button.getAttribute('aria-controls');if(id)expect(document.getElementById(id)).not.toBeNull();}
});
