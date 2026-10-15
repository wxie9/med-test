// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {ReportBody} from '@/components/psp/ReportPreview';
afterEach(cleanup);
// Read-only display fixtures: these do not assert legacy unknown evidence can be created through current UI.
it.each([['suppressed','已保护 · 不展示精确结果'],['unknown','未知 · 证据不足'],['no_applicable','无适用样本']] as const)('renders %s honestly without precise or zero fallback', (status,label)=>{
 render(createElement(ReportBody,{content:{title:'显示语义校验',notice:'只读组件夹具',chapters:[{title:'服务数据',paragraphs:[],facts:[{metricKey:'fixture',label:'测试指标',definition:'独立显示状态',unit:'people',status,value:98765,numerator:87654,denominator:76543,sampleN:65432}]}]}}));
 const row=screen.getByTestId('psp-report-fact-fixture');expect(row.textContent).toContain(label);expect(row.textContent).not.toMatch(/98765|87654|76543|65432|0%|0 人/);
});
