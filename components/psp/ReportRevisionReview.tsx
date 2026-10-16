'use client';
import type {
  NextAction,
  PspReportDetail,
  ReportComparedFact,
  ReportWorkflowMetadata,
} from '@/lib/psp/reportTypes';
import type { PspRole } from '@/lib/psp/types';
import {
  REPORT_ACTION_LABELS,
  REPORT_ROLE_LABELS,
  REPORT_STATUS_LABELS,
} from '@/lib/psp/reportTemplate';
import { formatPspTime } from './Common';

const reviewerLabel = (role: string) =>
  role === 'data_reviewer'
    ? '数据审核者'
    : role === 'medical_reviewer'
      ? '医学审核者'
      : '项目负责人';
// Keep milliseconds visible: two structured arrangements can differ by one millisecond.
const preciseTime = (value: string) =>
  `${formatPspTime(value)}.${String(new Date(value).getUTCMilliseconds()).padStart(3, '0')}（上海时间）`;
function FactValue({ fact }: { fact: ReportComparedFact | null }) {
  if (!fact) return <p>无此指标</p>;
  const status = {
    suppressed: '已保护 · 不展示精确结果',
    unknown: '未知 · 证据不足',
    no_applicable: '无适用样本',
    available: '可展示',
  };
  return (
    <div className="space-y-1">
      <p>
        {status[fact.status]}
        {fact.status === 'available' && (
          <>
            {' '}
            · 值 {fact.value ?? '未提供'} · 单位 {fact.unit}
            {fact.sampleN !== undefined && <> · 样本数 {fact.sampleN}</>}
            {fact.numerator !== undefined && <> · 分子 {fact.numerator}</>}
            {fact.denominator !== undefined && <> · 分母 {fact.denominator}</>}
          </>
        )}
      </p>
      <p className="text-gray-600">定义：{fact.definition}</p>
    </div>
  );
}
function ActionChanges({
  label,
  actions,
}: {
  label: string;
  actions: NextAction[];
}) {
  return (
    <details>
      <summary className="cursor-pointer">
        {label}安排（{actions.length}）
      </summary>
      {actions.length ? (
        <ol className="list-decimal space-y-2 pl-5">
          {actions.map((action, index) => (
            <li key={index}>
              {REPORT_ACTION_LABELS[action.category]} ·{' '}
              {REPORT_ROLE_LABELS[action.responsibleRole]} ·{' '}
              {preciseTime(action.dueAt)} ·{' '}
              {REPORT_STATUS_LABELS[action.status]}
            </li>
          ))}
        </ol>
      ) : (
        <p>无</p>
      )}
    </details>
  );
}
function FeedbackReasons({
  workflow,
  scope,
}: {
  workflow: ReportWorkflowMetadata;
  scope: '本版' | '上一版';
}) {
  return (
    <>
      {workflow.returnReview && (
        <div className="space-y-1 rounded border border-amber-200 p-3">
          <p>
            {scope}内部退回 · {reviewerLabel(workflow.returnReview.role)} ·{' '}
            {formatPspTime(workflow.returnReview.recordedAt)}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {workflow.returnReview.reason}
          </p>
        </div>
      )}
      {workflow.clientFeedback?.action === 'request_changes' && (
        <div className="space-y-1 rounded border border-amber-200 p-3">
          <p>
            {scope}客户修改意见 ·{' '}
            {formatPspTime(workflow.clientFeedback.recordedAt)}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {workflow.clientFeedback.comment}
          </p>
        </div>
      )}
    </>
  );
}
function nextStep(detail: PspReportDetail, role: PspRole, locked: boolean) {
  const { workflow, actionGates: gate, authorizationGate } = detail;
  if (locked) return '操作待完成或冲突待核对，请先完成重试或核对最新状态。';
  if (authorizationGate && authorizationGate.status !== 'eligible')
    return authorizationGate.reason ?? '当前来源授权不可用，请核对服务端条件。';
  const latestReason = [
    gate?.submitReason,
    gate?.reviewReason,
    gate?.deliverReason,
    gate?.reviseReason,
  ].find((reason) => reason?.includes('最新报告版本'));
  if (latestReason) return latestReason;
  if (
    workflow.status === 'changes_requested' ||
    workflow.status === 'client_changes_requested'
  )
    return '由项目经理创建新修订，请核对是否回应上一版意见。';
  if (workflow.status === 'draft')
    return role === 'project_manager'
      ? '尚未提交；核对固定正文和安排后提交报告审核。'
      : '尚未提交，等待项目经理提交报告审核。';
  if (workflow.status === 'accepted') return '查看本版交付与客户验收记录。';
  if (workflow.status === 'delivered') return '本版已交付，等待客户验收。';
  if (workflow.status === 'approved')
    return role === 'project_manager'
      ? '双签完成，请按服务端条件交付此报告版本。'
      : '本角色审核已完成，等待项目经理交付。';
  const kind =
    role === 'data_reviewer'
      ? 'data'
      : role === 'medical_reviewer'
        ? 'medical'
        : null;
  if (kind && workflow[kind === 'data' ? 'dataReview' : 'medicalReview'])
    return `本角色已签署，等待${kind === 'data' ? '医学审核者' : '数据审核者'}。`;
  if (kind && gate?.reviewReason) return gate.reviewReason;
  return kind
    ? '请核对上一版意见、本次变化和固定正文，再完成本角色审核。'
    : `等待本版${workflow.missingReviews.map((kind) => (kind === 'data' ? '数据审核者' : '医学审核者')).join('、')}签署。`;
}
export function ReportRevisionReview({
  detail,
  role,
  locked,
}: {
  detail: PspReportDetail;
  role: PspRole;
  locked: boolean;
}) {
  const { report, workflow, revisionComparison: comparison } = detail;
  const changed =
    comparison?.status === 'compared'
      ? comparison.metrics.filter((metric) => metric.change !== 'unchanged')
      : [];
  return (
    <section
      data-testid="psp-report-revision-review"
      className="min-w-0 space-y-4 rounded border border-gray-300 p-4 text-sm"
    >
      <div className="space-y-1">
        <h3 className="font-semibold">本版审核核对</h3>
        <p>
          修订 {report.revision} · {workflow.label}
        </p>
        <FeedbackReasons workflow={workflow} scope="本版" />
      </div>
      {comparison?.status === 'compared' ? (
        <>
          <div className="space-y-2">
            <h4 className="font-medium">
              上一版意见 · 修订 {comparison.parent.revision}
            </h4>
            <p className="break-all">明确父版本：{comparison.parent.id}</p>
            <FeedbackReasons
              workflow={comparison.parent.workflow}
              scope="上一版"
            />
            {!comparison.parent.workflow.returnReview &&
              comparison.parent.workflow.clientFeedback?.action !==
                'request_changes' && <p>上一版没有内部退回或客户修改意见。</p>}
            <p>
              请核对是否回应上一版意见；字段变化不能自动证明意见已充分解决。
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium">本次变化</h4>
            <p>
              冻结数据：
              {comparison.snapshot.idChanged ? '更换快照' : '同一快照'} ·
              快照摘要{comparison.snapshot.digestChanged ? '有变化' : '未变'}
            </p>
            {comparison.snapshot.idChanged && (
              <details>
                <summary className="cursor-pointer">快照标识</summary>
                <p className="break-all">
                  上一版：{comparison.snapshot.beforeId}
                </p>
                <p className="break-all">本版：{comparison.snapshot.afterId}</p>
              </details>
            )}
            <p>
              固定窗口{comparison.windowChanged ? '有变化' : '未变'} · 截止时点
              {comparison.window.before.cutoffAt ===
              comparison.window.after.cutoffAt
                ? '未变'
                : '有变化'}
            </p>
            {comparison.windowChanged && (
              <details>
                <summary className="cursor-pointer">窗口与截止时点</summary>
                {(['before', 'after'] as const).map((key) => (
                  <p key={key}>
                    {key === 'before' ? '上一版' : '本版'}：
                    {formatPspTime(comparison.window[key].periodStart)} —{' '}
                    {formatPspTime(comparison.window[key].periodEnd)} · 截至{' '}
                    {preciseTime(comparison.window[key].cutoffAt)}
                  </p>
                ))}
              </details>
            )}
            <p>
              {changed.length
                ? `受保护指标实际变化 ${changed.length} 项`
                : '可展示指标未变'}
              （按指标口径对齐）
            </p>
            {!!changed.length && (
              <details>
                <summary className="cursor-pointer">查看受保护指标变化</summary>
                <ul className="divide-y divide-gray-200">
                  {changed.map((metric) => (
                    <li key={metric.metricKey} className="space-y-2 py-3">
                      <p className="font-medium">
                        {metric.after?.label ?? metric.before?.label} ·{' '}
                        {metric.change === 'added'
                          ? '新增'
                          : metric.change === 'removed'
                            ? '移除'
                            : '变化'}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p>上一版</p>
                          <FactValue fact={metric.before} />
                        </div>
                        <div>
                          <p>本版</p>
                          <FactValue fact={metric.after} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="space-y-2">
              <h5 className="font-medium">
                下一期安排（按完整结构计数，重复项分别保留）
              </h5>
              <ActionChanges
                label="新增"
                actions={comparison.nextActions.added}
              />
              <ActionChanges
                label="移除"
                actions={comparison.nextActions.removed}
              />
              <ActionChanges
                label="未变"
                actions={comparison.nextActions.unchanged}
              />
            </div>
            <p>
              章标题与段落{comparison.contentChanged ? '有变化' : '未变'} ·
              模板、算法与保护规则{comparison.rulesChanged ? '有变化' : '未变'}
            </p>
            {comparison.rulesChanged && (
              <details>
                <summary className="cursor-pointer">规则版本</summary>
                {(['before', 'after'] as const).map((key) => (
                  <p key={key} className="break-all">
                    {key === 'before' ? '上一版' : '本版'}：
                    {Object.values(comparison.rules[key]).join(' · ')}
                  </p>
                ))}
              </details>
            )}
          </div>
        </>
      ) : (
        <p>
          {comparison?.status === 'initial'
            ? '初稿，无上一版可对照'
            : comparison?.status === 'unavailable'
              ? comparison.reason
              : '对照暂不可用，请刷新当前报告。'}
        </p>
      )}
      <div className="space-y-2 border-t border-gray-200 pt-3">
        <h4 className="font-medium">本版提交与签署</h4>
        <p className="break-all">
          {workflow.submission
            ? `本版提交：${workflow.submission.id} · 操作版本 ${workflow.submission.submittedVersion} · ${workflow.submission.actorId} · ${formatPspTime(workflow.submission.recordedAt)}`
            : '尚未提交'}
        </p>
        {(['data', 'medical'] as const).map((kind) => {
          const signed =
            workflow[kind === 'data' ? 'dataReview' : 'medicalReview'];
          return (
            <p key={kind} className="break-words">
              {kind === 'data' ? '数据审核' : '医学审核'}：
              {signed
                ? `已签署 · ${signed.actorId} · ${formatPspTime(signed.recordedAt)}`
                : '尚未签署'}
            </p>
          );
        })}
      </div>
      <p className="font-medium">下一步：{nextStep(detail, role, locked)}</p>
    </section>
  );
}
