import type {
  NextAction,
  PspReportVersion,
  ReportFact,
  ReportRevisionComparison,
} from './reportTypes';
import type { ReportActionEvent } from './reviewTypes';
import { projectReport } from './reviewProjection';
import { reportCanonical } from './reportValidation';

const same = (a: unknown, b: unknown) =>
  reportCanonical(a) === reportCanonical(b);
/** Only fixed protected facts participate; hidden numeric fields are discarded defensively. */
function protectedFact(fact: ReportFact): Omit<ReportFact, 'id'> {
  const { metricKey, label, definition, unit, status } = fact;
  return {
    metricKey,
    label,
    definition,
    unit,
    status,
    ...(status === 'available'
      ? {
          value: fact.value,
          sampleN: fact.sampleN,
          numerator: fact.numerator,
          denominator: fact.denominator,
        }
      : {}),
  };
}
const facts = (report: PspReportVersion) =>
  new Map(
    report.content.chapters.flatMap((chapter) =>
      chapter.facts.map(
        (fact) => [fact.metricKey, protectedFact(fact)] as const,
      ),
    ),
  );
const actionKey = (action: NextAction) =>
  reportCanonical({ ...action, dueAt: new Date(action.dueAt).toISOString() });
function actions(current: NextAction[], parent: NextAction[]) {
  const remaining = [...parent],
    added: NextAction[] = [],
    unchanged: NextAction[] = [];
  for (const action of current) {
    const index = remaining.findIndex(
      (old) => actionKey(old) === actionKey(action),
    );
    if (index < 0) added.push(action);
    else {
      unchanged.push(action);
      remaining.splice(index, 1);
    }
  }
  return { added, removed: remaining, unchanged };
}
const prose = (report: PspReportVersion) => ({
  title: report.content.title,
  notice: report.content.notice,
  chapters: report.content.chapters.map(({ title, paragraphs }) => ({
    title,
    paragraphs,
  })),
});
const rules = (report: PspReportVersion) => ({
  templateVersion: report.templateVersion,
  algorithmVersion: report.algorithmVersion,
  protectionVersion: report.protectionVersion,
});
/** A fresh internal read model; does not modify reports, recalculate metrics or choose a fallback parent. */
export function compareReportRevision(
  current: PspReportVersion,
  versions: PspReportVersion[],
  events: ReportActionEvent[],
): ReportRevisionComparison {
  if (!current.parentVersionId) return { status: 'initial' };
  const parent = versions.find(
    (version) =>
      version.id === current.parentVersionId &&
      version.projectId === current.projectId &&
      version.seedVersion === current.seedVersion &&
      version.batchId === current.batchId,
  );
  if (!parent)
    return {
      status: 'unavailable',
      reason: '明确父版本不存在，或项目、演示版本、报告批次不匹配；无法对照。',
    };
  const before = facts(parent),
    after = facts(current),
    keys = [...new Set([...before.keys(), ...after.keys()])];
  const parentEvents = events.filter(
    (event) =>
      event.reportVersionId === parent.id &&
      event.projectId === parent.projectId &&
      event.seedVersion === parent.seedVersion &&
      event.revision === parent.revision &&
      event.snapshotId === parent.snapshotId &&
      event.snapshotDigest === parent.snapshotDigest &&
      event.contentDigest === parent.contentDigest,
  );
  return structuredClone({
    status: 'compared',
    parent: {
      id: parent.id,
      revision: parent.revision,
      workflow: projectReport(parent, parentEvents).workflow,
    },
    snapshot: {
      idChanged: parent.snapshotId !== current.snapshotId,
      digestChanged: parent.snapshotDigest !== current.snapshotDigest,
      beforeId: parent.snapshotId,
      afterId: current.snapshotId,
    },
    windowChanged: !same(parent.window, current.window),
    window: { before: parent.window, after: current.window },
    contentChanged: !same(prose(parent), prose(current)),
    rulesChanged: !same(rules(parent), rules(current)),
    rules: { before: rules(parent), after: rules(current) },
    metrics: keys.map((metricKey) => {
      const previous = before.get(metricKey) ?? null,
        next = after.get(metricKey) ?? null;
      return {
        metricKey,
        before: previous,
        after: next,
        change: !previous
          ? 'added'
          : !next
            ? 'removed'
            : same(previous, next)
              ? 'unchanged'
              : 'changed',
      };
    }),
    nextActions: actions(current.nextActions, parent.nextActions),
  } as ReportRevisionComparison);
}
