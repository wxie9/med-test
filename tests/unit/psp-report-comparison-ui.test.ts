// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ReportRevisionReview } from '@/components/psp/ReportRevisionReview';
import type {
  PspReportDetail,
  ReportRevisionComparison,
} from '@/lib/psp/reportTypes';
const event = {
  id: 'SUB2',
  actorId: 'data-reviewer-psp',
  recordedAt: '2026-10-13T02:00:00Z',
  reportVersionId: 'R2',
  submittedVersion: 2,
};
const workflow = {
  status: 'in_review',
  label: '审核中',
  submission: event,
  dataReview: event,
  medicalReview: null,
  returnReview: null,
  clientFeedback: null,
  missingReviews: ['medical'],
};
const comparison = {
  status: 'compared',
  parent: {
    id: 'R1',
    revision: 1,
    workflow: {
      returnReview: {
        ...event,
        role: 'medical_reviewer',
        reason: '上一版补充安排',
      },
      clientFeedback: null,
    },
  },
  snapshot: {
    idChanged: true,
    digestChanged: true,
    beforeId: 'S1',
    afterId: 'S2',
  },
  windowChanged: false,
  window: {
    before: { cutoffAt: event.recordedAt },
    after: { cutoffAt: event.recordedAt },
  },
  contentChanged: true,
  rulesChanged: false,
  metrics: [],
  nextActions: { added: [], removed: [], unchanged: [] },
};
function detail(patch: Record<string, unknown> = {}): PspReportDetail {
  return {
    ...{
      report: { id: 'R2', revision: 2 },
      workflow,
      revisionComparison: comparison,
      actionGates: { reviewReason: '本角色已完成审核' },
      authorizationGate: { status: 'eligible', reason: null },
    },
    ...patch,
  } as unknown as PspReportDetail;
}
afterEach(cleanup);
it('separates parent feedback, own submission and post-sign handoff', () => {
  render(
    createElement(ReportRevisionReview, {
      detail: detail(),
      role: 'data_reviewer',
      locked: false,
    }),
  );
  expect(screen.getByRole('heading', { name: '本版审核核对' })).toBeTruthy();
  expect(screen.getByText(/上一版内部退回/)).toBeTruthy();
  expect(screen.getByText('上一版补充安排')).toBeTruthy();
  expect(screen.getByText(/本角色已签署，等待医学审核者/)).toBeTruthy();
  expect(screen.getByText(/SUB2/)).toBeTruthy();
  expect(screen.getByText(/请核对是否回应上一版意见/)).toBeTruthy();
});
it('displays current return separately and never concludes parent concerns resolved', () => {
  render(
    createElement(ReportRevisionReview, {
      detail: detail({
        workflow: {
          ...workflow,
          status: 'changes_requested',
          returnReview: {
            ...event,
            role: 'data_reviewer',
            reason: '本版仍需补充',
          },
        },
      }),
      role: 'project_manager',
      locked: false,
    }),
  );
  expect(screen.getByText('本版仍需补充')).toBeTruthy();
  expect(screen.getByText('上一版补充安排')).toBeTruthy();
  expect(screen.getByText(/由项目经理创建新修订/)).toBeTruthy();
  expect(screen.queryByText(/问题已修复/)).toBeNull();
});
it.each(['suppressed', 'unknown', 'no_applicable'])(
  'never displays malformed %s numeric fields from comparison',
  (status) => {
    const fact = {
      metricKey: 'metric',
      label: '测试指标',
      definition: '保护定义',
      unit: 'people',
      status,
      value: 987654,
      sampleN: 876543,
      numerator: 765432,
      denominator: 654321,
    };
    render(
      createElement(ReportRevisionReview, {
        detail: detail({
          revisionComparison: {
            ...comparison,
            metrics: [
              {
                metricKey: 'metric',
                before: fact,
                after: fact,
                change: 'changed',
              },
            ],
          } as unknown as ReportRevisionComparison,
        }),
        role: 'medical_reviewer',
        locked: false,
      }),
    );
    expect(
      screen.getByTestId('psp-report-revision-review').textContent,
    ).not.toMatch(/987654|876543|765432|654321/);
  },
);
it.each([
  { status: 'initial' },
  { status: 'unavailable', reason: '父版本归属不可用' },
])('renders comparison state %j', (revisionComparison) => {
  render(
    createElement(ReportRevisionReview, {
      detail: detail({ revisionComparison }),
      role: 'project_manager',
      locked: false,
    }),
  );
  expect(
    screen.getByText(
      revisionComparison.status === 'initial'
        ? '初稿，无上一版可对照'
        : '父版本归属不可用',
    ),
  ).toBeTruthy();
});
it('source, newest revision and unconfirmed command reasons take precedence over friendly handoff', () => {
  const view = render(
    createElement(ReportRevisionReview, {
      detail: detail({
        authorizationGate: { status: 'revoked', reason: '汇总授权已撤回' },
      }),
      role: 'data_reviewer',
      locked: false,
    }),
  );
  expect(screen.getByText(/汇总授权已撤回/)).toBeTruthy();
  expect(screen.queryByText(/本角色已签署，等待/)).toBeNull();
  view.rerender(
    createElement(ReportRevisionReview, {
      detail: detail({
        actionGates: { reviewReason: '请操作批次最新报告版本' },
      }),
      role: 'data_reviewer',
      locked: false,
    }),
  );
  expect(screen.getByText(/请操作批次最新报告版本/)).toBeTruthy();
  view.rerender(
    createElement(ReportRevisionReview, {
      detail: detail(),
      role: 'data_reviewer',
      locked: true,
    }),
  );
  expect(screen.getByText(/操作待完成或冲突待核对/)).toBeTruthy();
  expect(screen.queryByText(/本角色已签署，等待/)).toBeNull();
});
it('shows arrangement milliseconds so distinct instants cannot look identical', () => {
  const action = {
    category: 'overdue_followup',
    responsibleRole: 'case_manager',
    status: 'planned',
    dueAt: '2026-10-14T01:00:00.001Z',
  };
  render(
    createElement(ReportRevisionReview, {
      detail: detail({
        revisionComparison: {
          ...comparison,
          nextActions: {
            added: [action],
            removed: [{ ...action, dueAt: '2026-10-14T01:00:00.002Z' }],
            unchanged: [action, action],
          },
        },
      }),
      role: 'project_manager',
      locked: false,
    }),
  );
  expect(screen.getByText(/新增安排（1）/)).toBeTruthy();
  expect(screen.getByText(/未变安排（2）/)).toBeTruthy();
  expect(
    screen.getByTestId('psp-report-revision-review').textContent,
  ).toContain('09:00:00.001（上海时间）');
  expect(
    screen.getByTestId('psp-report-revision-review').textContent,
  ).toContain('09:00:00.002（上海时间）');
});
it('distinguishes customer feedback and double-sign completion waiting for delivery', () => {
  render(
    createElement(ReportRevisionReview, {
      detail: detail({
        workflow: {
          ...workflow,
          status: 'approved',
          medicalReview: { ...event, actorId: 'medical-reviewer-psp' },
        },
        revisionComparison: {
          ...comparison,
          parent: {
            ...comparison.parent,
            workflow: {
              ...comparison.parent.workflow,
              returnReview: null,
              clientFeedback: {
                ...event,
                action: 'request_changes',
                comment: '客户请核对期间',
              },
            },
          },
        },
      }),
      role: 'data_reviewer',
      locked: false,
    }),
  );
  expect(screen.getByText(/上一版客户修改意见/)).toBeTruthy();
  expect(screen.getByText('客户请核对期间')).toBeTruthy();
  expect(screen.getByText(/本角色审核已完成，等待项目经理交付/)).toBeTruthy();
});
