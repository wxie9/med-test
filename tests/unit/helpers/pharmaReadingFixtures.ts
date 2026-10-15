import type {ReadablePharmaReport} from '@/components/psp/pharmaReadingModel';
import type {PharmaProjectView, PharmaReportView} from '@/lib/psp/pharmaView';
import {REPORT_FACT_CATALOG} from '@/lib/psp/reportTemplate';

const project: PharmaProjectView['project'] = {
  id: 'PSP-1', title: '合成支持项目', sponsor: '虚构药企A', scope: '类别支持',
  population: '合成成员', startsAt: '2026-09-30T16:00:00.000Z',
  endsAt: '2026-12-31T15:59:59.000Z', period: '2026-10',
  cutoffAt: '2026-10-13T02:00:00.000Z', contactTargets: {high: 2, medium: 24},
  configVersion: 1, status: 'active',
};

export function publicReportFixture(overrides: Partial<ReadablePharmaReport> = {}): ReadablePharmaReport {
  return structuredClone({
    id: 'R1', projectId: project.id, status: 'delivered', version: 5,
    seedVersion: 1, authorizationVersion: 2,
    authorizationGate: {status: 'eligible', reason: null},
    gate: {status: 'available', reason: null}, revision: 1,
    window: {periodStart: project.startsAt, periodEnd: '2026-10-31T16:00:00.000Z', cutoffAt: project.cutoffAt},
    templateVersion: 'psp-report-template-v1', algorithmVersion: 'psp-metrics-v1',
    protectionVersion: 'psp-k5-v1', contentDigest: 'a'.repeat(64),
    content: {
      title: '固定交付报告', notice: '模板草稿，待人工审核',
      chapters: ['项目范围', '数据说明', '服务执行', '患者反馈', '质量与限制', '下一期服务安排', '审核与交付']
        .map((title, index) => ({
          title, paragraphs: ['固定保护正文'],
          facts: REPORT_FACT_CATALOG.filter(entry => entry.chapter === index + 1)
            .map(entry => ({metricKey: entry.key, label: entry.label, definition: entry.definition,
              unit: entry.unit, status: 'no_applicable' as const})),
        })),
    },
    nextActions: [],
    signatures: [{role: 'data_reviewer', occurredAt: project.cutoffAt}, {role: 'medical_reviewer', occurredAt: project.cutoffAt}],
    delivery: {deliveredAt: project.cutoffAt, artifactDigest: 'b'.repeat(64)},
    artifact: {text: '固定保护正文', digest: 'b'.repeat(64)},
    ...overrides,
  });
}

export function publicProjectFixture(reports: PharmaReportView[] = [publicReportFixture()]): PharmaProjectView {
  return structuredClone({project, allowedMembers: {status: 'available', value: 14}, metrics: [],
    reports, seedVersion: 1, authorizationVersion: 2, agentMode: 'deterministic', serverNow: project.cutoffAt});
}
