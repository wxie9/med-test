import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  buildPspTestStore,
  installPspTestStore,
  PSP_TEST_NOW,
} from '../helpers/psp';
import { getStore } from '@/lib/state/store';
import { freezePspSnapshot } from '@/lib/psp/snapshot';
import { createReportDraft, readInternalReport } from '@/lib/psp/reports';
import { submitReport, reviewReport } from '@/lib/psp/review';
import { deliverReport, requestClientChanges } from '@/lib/psp/delivery';
import {
  getPharmaProjectView,
  readPharmaReport,
  readPharmaFactPack,
} from '@/lib/psp/pharmaView';
import { compareReportRevision } from '@/lib/psp/reportComparison';
import type { CommandMeta } from '@/lib/psp/types';
const project = 'PSP-BC-ENDO-001',
  window = {
    periodStart: '2026-10-01T00:00:00+08:00',
    periodEnd: '2026-11-01T00:00:00+08:00',
    cutoffAt: PSP_TEST_NOW,
  };
const meta = (
  id: string,
  expectedVersion = getStore().psp.ledgerRevision,
  kind?: 'data' | 'medical',
): CommandMeta => ({
  seedVersion: getStore().seedVersion,
  expectedVersion,
  clientRequestId: id,
  role: kind ? `${kind}_reviewer` : 'project_manager',
  actorId: kind ? `${kind}-reviewer-psp` : 'project-manager-psp',
});
const freeze = (id: string) =>
  freezePspSnapshot(project, window, meta(id)).data;
const action = {
  category: 'overdue_followup' as const,
  responsibleRole: 'case_manager' as const,
  dueAt: '2026-10-14T01:00:00.001Z',
  status: 'planned' as const,
};
const first = () =>
  createReportDraft(freeze('freeze').id, { nextActions: [] }, meta('first'))
    .data;
beforeEach(() => {
  process.env.DEMO_FIXED_NOW = PSP_TEST_NOW;
  installPspTestStore(buildPspTestStore());
});
afterEach(() => {
  delete process.env.DEMO_FIXED_NOW;
});
it('compares arrangements only for same-snapshot revision, retains old bytes and fresh internal response', () => {
  const original = first(),
    bytes = JSON.stringify(original),
    revised = createReportDraft(
      original.snapshotId,
      { parentVersionId: original.id, nextActions: [action] },
      meta('revise'),
    ).data;
  const detail = readInternalReport(
    revised.id,
    'data_reviewer',
    'data-reviewer-psp',
    getStore().seedVersion,
  );
  expect(detail.revisionComparison).toMatchObject({
    status: 'compared',
    parent: { id: original.id },
    snapshot: { idChanged: false, digestChanged: false },
    windowChanged: false,
    rulesChanged: false,
  });
  if (detail.revisionComparison.status !== 'compared')
    throw Error('comparison missing');
  expect(
    detail.revisionComparison.metrics.every((m) => m.change === 'unchanged'),
  ).toBe(true);
  expect(detail.revisionComparison.nextActions.added).toEqual([action]);
  expect(detail.revisionComparison.contentChanged).toBe(true);
  expect(JSON.stringify(getStore().psp.reportVersions![0])).toBe(bytes);
  detail.revisionComparison.parent.id = 'tampered';
  expect(
    readInternalReport(
      revised.id,
      'data_reviewer',
      'data-reviewer-psp',
      getStore().seedVersion,
    ).revisionComparison,
  ).toMatchObject({ parent: { id: original.id } });
});
it('ignores new fact IDs when a fresh snapshot has identical protected facts', () => {
  const original = first(),
    revised = createReportDraft(
      freeze('again').id,
      { parentVersionId: original.id, nextActions: [] },
      meta('revision'),
    ).data;
  const result = compareReportRevision(revised, [original, revised], []);
  expect(result.status).toBe('compared');
  if (result.status !== 'compared') return;
  expect(result.snapshot.idChanged).toBe(true);
  expect(result.metrics.every((m) => m.change === 'unchanged')).toBe(true);
  expect(result.contentChanged).toBe(false);
});
it('compares actual protected status, definition and available numbers by metricKey without exposing hidden numbers', () => {
  const original = first(),
    current = structuredClone(original);
  current.id = 'next';
  current.parentVersionId = original.id;
  current.revision = 2;
  const facts = current.content.chapters.flatMap((c) => c.facts);
  facts[0].definition += ' changed';
  facts[1].status = 'available';
  facts[1].value = 123;
  facts[2].status = 'unknown';
  facts[2].value = 987654;
  const result = compareReportRevision(current, [original], []);
  if (result.status !== 'compared') throw Error('missing');
  expect(
    result.metrics
      .filter((m) => m.change === 'changed')
      .map((m) => m.metricKey),
  ).toEqual(facts.slice(0, 3).map((f) => f.metricKey));
  expect(JSON.stringify(result)).not.toContain('987654');
});
it('uses a multiset for duplicates and exact instants, treating equivalent offsets as equal', () => {
  const original = first(),
    parent = { ...original, nextActions: [action, action] },
    current = {
      ...original,
      id: 'next',
      parentVersionId: original.id,
      nextActions: [
        { ...action, dueAt: '2026-10-14T09:00:00.001+08:00' },
        { ...action, dueAt: '2026-10-14T01:00:00.002Z' },
      ],
    };
  const result = compareReportRevision(current, [parent], []);
  if (result.status !== 'compared') throw Error('missing');
  expect(result.nextActions.unchanged).toHaveLength(1);
  expect(result.nextActions.added).toEqual([current.nextActions[1]]);
  expect(result.nextActions.removed).toEqual([action]);
});
it('distinguishes initial and unavailable; never falls back on wrong project, seed or batch', () => {
  const original = first();
  expect(compareReportRevision(original, [], []).status).toBe('initial');
  const current = { ...original, id: 'next', parentVersionId: original.id };
  expect(compareReportRevision(current, [], []).status).toBe('unavailable');
  for (const patch of [
    { projectId: 'wrong' },
    { seedVersion: 99 },
    { batchId: 'wrong' },
  ])
    expect(
      compareReportRevision(current, [{ ...original, ...patch }], []).status,
    ).toBe('unavailable');
});
it('keeps parent return feedback distinct from the current submission and own signatures', () => {
  const original = first();
  submitReport(original.id, meta('submit', 1));
  reviewReport(
    original.id,
    { kind: 'data', decision: 'approve' },
    meta('approve', 2, 'data'),
  );
  reviewReport(
    original.id,
    { kind: 'medical', decision: 'return', reason: '补充安排' },
    meta('return', 3, 'medical'),
  );
  const revised = createReportDraft(
    original.snapshotId,
    { parentVersionId: original.id, nextActions: [action] },
    meta('revision'),
  ).data;
  submitReport(revised.id, meta('resubmit', 1));
  reviewReport(
    revised.id,
    { kind: 'medical', decision: 'approve' },
    meta('own', 2, 'medical'),
  );
  const detail = readInternalReport(
    revised.id,
    'data_reviewer',
    'data-reviewer-psp',
    getStore().seedVersion,
  );
  expect(detail.revisionComparison).toMatchObject({
    status: 'compared',
    parent: {
      workflow: {
        returnReview: { reason: '补充安排' },
        dataReview: { reportVersionId: original.id },
      },
    },
  });
  expect(detail.workflow.dataReview).toBeNull();
  expect(detail.workflow.medicalReview?.reportVersionId).toBe(revised.id);
});

it('compares protected value/status/unit/definition independently and separates window and rule changes', () => {
  const parent = first();
  for (const patch of [
    { value: 123456, status: 'available' as const },
    { status: 'unknown' as const },
    { unit: 'hours' as const },
    { definition: '新定义' },
    { sampleN: 123456, status: 'available' as const },
    { numerator: 123456, status: 'available' as const },
    { denominator: 123456, status: 'available' as const },
  ]) {
    const current = structuredClone(parent);
    current.id = 'new';
    current.parentVersionId = parent.id;
    const fact = current.content.chapters.flatMap((c) => c.facts)[0];
    Object.assign(fact, patch);
    const compared = compareReportRevision(current, [parent], []);
    if (compared.status !== 'compared') throw Error('missing');
    expect(
      compared.metrics.find((m) => m.metricKey === fact.metricKey)?.change,
    ).toBe('changed');
  }
  const current = {
    ...parent,
    id: 'new',
    parentVersionId: parent.id,
    window: { ...parent.window, cutoffAt: '2026-10-13T02:00:00.001Z' },
    algorithmVersion: 'future' as never,
  };
  const compared = compareReportRevision(current, [parent], []);
  expect(compared).toMatchObject({
    status: 'compared',
    windowChanged: true,
    rulesChanged: true,
    contentChanged: false,
    snapshot: { idChanged: false, digestChanged: false },
  });
});
it('retains explicit parent client feedback without leaking internal comparison or notes to public DTOs or artifact bytes', () => {
  const parent = first();
  submitReport(parent.id, meta('submit', 1));
  reviewReport(
    parent.id,
    { kind: 'data', decision: 'approve' },
    meta('data', 2, 'data'),
  );
  reviewReport(
    parent.id,
    { kind: 'medical', decision: 'approve' },
    meta('medical', 3, 'medical'),
  );
  deliverReport(parent.id, meta('deliver', 4));
  const bytes = JSON.stringify(getStore().psp.deliveryArtifacts);
  requestClientChanges(parent.id, '客户请求核对下一期安排', {
    ...meta('client', 5),
    role: 'pharma_owner',
    actorId: 'pharma-owner-a',
  });
  const current = createReportDraft(
    parent.snapshotId,
    { parentVersionId: parent.id, nextActions: [action] },
    meta('revision'),
  ).data;
  const compared = readInternalReport(
    current.id,
    'medical_reviewer',
    'medical-reviewer-psp',
    getStore().seedVersion,
  );
  expect(compared.revisionComparison).toMatchObject({
    status: 'compared',
    parent: {
      id: parent.id,
      workflow: {
        clientFeedback: {
          action: 'request_changes',
          comment: '客户请求核对下一期安排',
        },
      },
    },
  });
  expect(compared.workflow).toMatchObject({
    submission: null,
    dataReview: null,
    medicalReview: null,
    clientFeedback: null,
  });
  for (const dto of [
    getPharmaProjectView(project),
    readPharmaReport(project, parent.id),
    readPharmaFactPack(project, parent.id),
  ])
    expect(JSON.stringify(dto)).not.toMatch(
      /revisionComparison|parentVersionId|returnReview|internalMetrics|sourceRefs|本版审核核对/,
    );
  expect(JSON.stringify(getStore().psp.deliveryArtifacts)).toBe(bytes);
  expect(bytes).not.toMatch(/revisionComparison|客户请求核对下一期安排/);
});
