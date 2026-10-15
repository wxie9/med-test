import type {PharmaReportView} from '@/lib/psp/pharmaView';

export type ReadablePharmaReport = Extract<PharmaReportView, {content: unknown}>;
export type PublicFact = ReadablePharmaReport['content']['chapters'][number]['facts'][number];
export const READING_METRIC_KEYS = [
  'questionnaire_completion', 'contact_completion', 'education_completion', 'service_completion',
] as const;
export type ReadingMetricKey = typeof READING_METRIC_KEYS[number];
export type ReadingFact = {
  metricKey: string;
  label: string;
  definition: string | null;
  unitLabel: string | null;
  status: PublicFact['status'] | 'unreadable';
  result: string;
};

const units: Record<PublicFact['unit'], string> = {
  people: '人', forms: '份', assignments: '项', alerts: '件', interactions: '次',
  doses: '剂', hours: '小时', days: '天', records: '条',
};
const numberFormat = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2});

function unreadableFact(metricKey: string): ReadingFact {
  return {metricKey, label: '本项数据暂不能读取', definition: null, unitLabel: null,
    status: 'unreadable', result: '暂不能读取本项，请刷新重试。'};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isReadablePharmaReport(report: PharmaReportView): report is ReadablePharmaReport {
  return report.gate.status === 'available' && 'content' in report && isRecord(report.content);
}

export function presentPublicFact(input: unknown, metricKey: string): ReadingFact {
  if (!isRecord(input) || input.metricKey !== metricKey || !isText(input.label) || !isText(input.definition)
    || typeof input.unit !== 'string' || !Object.prototype.hasOwnProperty.call(units, input.unit)) {
    return unreadableFact(metricKey);
  }
  const base = {metricKey, label: input.label, definition: input.definition,
    unitLabel: units[input.unit as PublicFact['unit']]};

  // Unavailable facts never copy or format their dormant numeric fields.
  if (input.status === 'suppressed') return {...base, status: input.status, result: '已保护 · 本项不展示精确结果'};
  if (input.status === 'unknown') return {...base, status: input.status, result: '证据不足 · 本项暂不能判断'};
  if (input.status === 'no_applicable') return {...base, status: input.status, result: '本阶段无适用样本'};
  if (input.status !== 'available' || !isFiniteNumber(input.value)) return unreadableFact(metricKey);

  const {numerator, denominator, sampleN} = input;
  const hasRatio = numerator !== undefined || denominator !== undefined;
  if (hasRatio && (!isFiniteNumber(numerator) || !isFiniteNumber(denominator))) return unreadableFact(metricKey);
  if (sampleN !== undefined && (!isFiniteNumber(sampleN) || !Number.isInteger(sampleN) || sampleN < 0)) {
    return unreadableFact(metricKey);
  }
  const result = hasRatio ? `${numerator} / ${denominator}` : `${numberFormat.format(input.value)} ${base.unitLabel}`;
  return {...base, status: 'available', result: result + (sampleN !== undefined ? ` · 适用样本 ${sampleN}` : '')};
}

export function buildReadingSummary(content: ReadablePharmaReport['content']): ReadingFact[] {
  const chapters: unknown[] = isRecord(content) && Array.isArray(content.chapters) ? content.chapters : [];
  const facts: unknown[] = chapters.flatMap(chapter => isRecord(chapter) && Array.isArray(chapter.facts) ? chapter.facts : []);
  return READING_METRIC_KEYS.map(metricKey => {
    const matches = facts.filter(fact => isRecord(fact) && fact.metricKey === metricKey);
    return presentPublicFact(matches.length === 1 ? matches[0] : undefined, metricKey);
  });
}
