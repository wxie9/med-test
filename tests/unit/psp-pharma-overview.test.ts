// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {PharmaProjects} from '@/components/psp/PharmaProjects';
import {formatPspTime} from '@/components/psp/Common';
import type {PharmaProjectView, PharmaReportView} from '@/lib/psp/pharmaView';
import {publicProjectFixture, publicReportFixture} from './helpers/pharmaReadingFixtures';

const emptyMessage = '本阶段尚无已交付报告。完成双审核并由项目经理交付后可在此查看。';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

async function mount(view: PharmaProjectView = publicProjectFixture()) {
  const fetcher = vi.fn().mockResolvedValue(json(view));
  vi.stubGlobal('fetch', fetcher);
  const result = render(createElement(PharmaProjects, {projectId: view.project.id}));
  await screen.findByRole('heading', {name: view.project.title});
  return {result, fetcher};
}
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

describe('project scope and delivery explanation', () => {
  it('explains the project, services, stage, delivery and current authorization in reading order', async () => {
    const view = publicProjectFixture([]);
    await mount(view);
    expect(screen.getAllByRole('heading').map(node => node.textContent)).toEqual([
      '项目概览', view.project.title, '本演示支持的服务内容', '周期与阶段',
      '本阶段交付构成', '项目报告', '当前汇总授权',
    ]);
    for (const text of [view.project.sponsor, view.project.population, view.project.scope,
      '合成数据 · 虚构项目', '计划问卷', '服务联系', '必要时医生复核', '批准教育及患者反馈']) {
      expect(screen.getByText(text, {exact: false})).toBeTruthy();
    }
    expect(screen.getByText('以下时间均为上海时间。')).toBeTruthy();
    expect(screen.getByText(`服务周期：${formatPspTime(view.project.startsAt)} — ${formatPspTime(view.project.endsAt)}`)).toBeTruthy();
    expect(screen.getByText(`阶段：${view.project.period} · 数据截止：${formatPspTime(view.project.cutoffAt)}`)).toBeTruthy();
    expect(screen.getByText('联系目标（演示配置，模拟自然小时）：高 2 小时 / 中 24 小时')).toBeTruthy();
    const delivery = screen.getByRole('region', {name: '本阶段交付构成'});
    expect(delivery.textContent).toContain('是否已交付，以各版报告状态为准');
    for (const text of ['受保护阶段报告', '数据与医学签署记录', '固定文本 / HTML 文件', '下一期服务安排与客户反馈']) {
      expect(within(delivery).getByText(text)).toBeTruthy();
    }
    expect(screen.getByRole('link', {name: '切换到院内服务演示'}).getAttribute('href'))
      .toBe('/clinic/projects/PSP-1/services');
    expect(document.body.textContent).not.toMatch(/已签合同|预算|SOW版本|真实疗效|交付已完成/);
  });

  it('has a real empty state without inventing a delivered report or publishing metric values', async () => {
    const {fetcher} = await mount(publicProjectFixture([]));
    expect(screen.getByText(emptyMessage)).toBeTruthy();
    const reports = screen.getByRole('region', {name: '项目报告'});
    expect(within(reports).queryByRole('link')).toBeNull();
    expect(within(reports).queryByRole('list')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/pharma/projects/PSP-1', {cache: 'no-store'});
  });

  it.each(['draft', 'in_review', 'approved', 'changes_requested'] as const)('does not publish an undelivered %s candidate even if it reaches the UI', async status => {
    await mount(publicProjectFixture([publicReportFixture({status})]));
    expect(screen.getByText(emptyMessage)).toBeTruthy();
    expect(within(screen.getByRole('region', {name: '项目报告'})).queryByRole('link')).toBeNull();
    expect(screen.queryByText('固定交付报告')).toBeNull();
  });

  it('shows current allowed members without extracting frozen report metrics or denominators', async () => {
    const report = publicReportFixture();
    for (const chapter of report.content.chapters) chapter.facts = chapter.facts.map(fact =>
      fact.metricKey === 'period_members' ? {...fact, status: 'available', value: 12} :
        {...fact, status: 'available', value: 987, numerator: 987, denominator: 1234, sampleN: 1234});
    await mount(publicProjectFixture([report]));
    expect(screen.getByText('当前允许汇总人数：14 人')).toBeTruthy();
    expect(screen.getByText('当前汇总授权人数不等于本版报告的统计分母；各版统计范围以固定报告为准。')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/12 人|987|1234|20 人|18 人|内外差额/);
  });

  it.each([
    {status: 'suppressed', reason: '样本量未达到最低展示门槛（k=5）'},
    {status: 'no_applicable', reason: '当前暂无可汇总成员'},
  ] as const)('shows only the existing reason when current members are $status', async allowedMembers => {
    await mount({...publicProjectFixture([]), allowedMembers});
    const section = screen.getByRole('region', {name: '当前汇总授权'});
    expect(section.textContent).toContain(allowedMembers.reason);
    expect(section.textContent).not.toMatch(/14 人|18 人|20 人|0 人|差额/);
  });
});

describe('per-version delivery entries', () => {
  it.each([
    ['delivered', '已交付，待客户反馈', '查看本次交付'],
    ['accepted', '客户已验收', '查看验收记录'],
    ['client_changes_requested', '客户已请求修改', '查看修改请求'],
  ] as const)('gives readable %s the exact report entry', async (status, label, action) => {
    const report = publicReportFixture({id: 'psp-report:R/中文', status, revision: 2});
    await mount(publicProjectFixture([report]));
    const link = screen.getByRole('link', {name: `${action} · 修订 2`});
    expect(link.getAttribute('href')).toBe('/pharma/projects/PSP-1/reports/psp-report%3AR%2F%E4%B8%AD%E6%96%87');
    const row = link.closest('li')!;
    expect(row.textContent).toContain(`修订 2 · ${label}`);
    expect(row.textContent).toContain('固定交付报告');
    expect(row.textContent).toContain(`阶段截止：${formatPspTime(report.window.cutoffAt)}（上海时间）`);
    expect(row.textContent).not.toMatch(/已达标|报告待人工审核/);
  });

  it.each(['blocked', 'revoked'] as const)('shows only the %s gate reason even when old details remain attached', async status => {
    const readable = publicReportFixture({id: 'PRIVATE_REPORT', revision: 777,
      content: {...publicReportFixture().content, title: 'PRIVATE_REPORT_TITLE'}});
    const report: PharmaReportView = {...readable, gate: {status, reason: '当前授权已停止此报告访问'}};
    await mount(publicProjectFixture([report]));
    const link = screen.getByRole('link', {name: '查看访问状态'});
    const row = link.closest('li')!;
    expect(row.textContent).toBe('当前授权已停止此报告访问查看访问状态');
    expect(row.textContent).not.toMatch(/PRIVATE|777|阶段截止|签署|校验|固定交付报告/);
    expect(link.getAttribute('href')).toBe('/pharma/projects/PSP-1/reports/PRIVATE_REPORT');
    expect(screen.queryByRole('link', {name: /查看本次交付|查看验收记录|查看修改请求/})).toBeNull();
  });

  it('retains projection order and each version own window and gate without selecting an older fallback', async () => {
    const first = publicReportFixture({id: 'OLDER', revision: 1, status: 'accepted'});
    const blocked: PharmaReportView = {...publicReportFixture({id: 'BLOCKED', revision: 2}),
      gate: {status: 'revoked', reason: '此版访问停止'}};
    const last = publicReportFixture({id: 'NEWER', revision: 3,
      window: {...first.window, cutoffAt: '2026-10-14T02:00:00.000Z'}});
    await mount(publicProjectFixture([last, blocked, first]));
    const section = screen.getByRole('region', {name: '项目报告'});
    const rows = within(section).getAllByRole('listitem');
    expect(rows.map(row => within(row).getByRole('link').getAttribute('href'))).toEqual([
      '/pharma/projects/PSP-1/reports/NEWER', '/pharma/projects/PSP-1/reports/BLOCKED', '/pharma/projects/PSP-1/reports/OLDER',
    ]);
    expect(rows[0].textContent).toContain(formatPspTime(last.window.cutoffAt));
    expect(rows[2].textContent).toContain(formatPspTime(first.window.cutoffAt));
    expect(rows[1].textContent).toBe('此版访问停止查看访问状态');
    expect(within(section).queryByText(/最新可用|自动切换/)).toBeNull();
  });

  it('refreshes access on the existing owner and retires the previous content on a read failure', async () => {
    const view = publicProjectFixture();
    let failed = false;
    const fetcher = vi.fn(() => Promise.resolve(failed ? json({}, 503) : json(view)));
    vi.stubGlobal('fetch', fetcher);
    render(createElement(PharmaProjects, {projectId: view.project.id}));
    await screen.findByRole('link', {name: '查看本次交付 · 修订 1'});
    failed = true;
    fireEvent.click(screen.getByRole('button', {name: '刷新项目与授权'}));
    await screen.findByText('加载失败（503），请重试。');
    expect(screen.queryByRole('region', {name: '项目报告'})).toBeNull();
    expect(screen.queryByText(view.project.sponsor, {exact: false})).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', {name: '重新加载'}));
    await screen.findByRole('link', {name: '查看本次交付 · 修订 1'});
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const call of [1, 2, 3]) expect(fetcher).toHaveBeenNthCalledWith(call, '/api/pharma/projects/PSP-1', {cache: 'no-store'});
  });
});

it('keeps the existing project list entry and request without rendering report details there', async () => {
  const view = publicProjectFixture();
  const fetcher = vi.fn().mockResolvedValue(json({projects: [{project: view.project, allowedMembers: view.allowedMembers}],
    seedVersion: 1, authorizationVersion: 2, serverNow: view.serverNow, agentMode: 'deterministic'}));
  vi.stubGlobal('fetch', fetcher);
  render(createElement(PharmaProjects));
  const link = await screen.findByRole('link', {name: view.project.title});
  expect(link.getAttribute('href')).toBe('/pharma/projects/PSP-1');
  expect(screen.queryByRole('region', {name: '项目报告'})).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/api/pharma/projects', {cache: 'no-store'});
});
