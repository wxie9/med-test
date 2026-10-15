import {describe, expect, it} from 'vitest';
import {buildReadingSummary, isReadablePharmaReport, presentPublicFact, READING_METRIC_KEYS,
  type PublicFact, type ReadablePharmaReport} from '@/components/psp/pharmaReadingModel';
import type {PharmaReportView} from '@/lib/psp/pharmaView';
import {publicProjectFixture, publicReportFixture} from './helpers/pharmaReadingFixtures';

const fact: PublicFact = {
  metricKey: 'contact_completion', label: '到期计划联系成功率', definition: '本版独立定义',
  unit: 'assignments', status: 'available', value: 9 / 14, numerator: 9, denominator: 14, sampleN: 14,
};
const unreadable = {status: 'unreadable', result: '暂不能读取本项，请刷新重试。'};

describe('public fact presentation', () => {
  it('preserves the original ratio, label, unit and definition without deriving percentages or complements', () => {
    expect(presentPublicFact(fact, fact.metricKey)).toEqual({
      metricKey: fact.metricKey, label: fact.label, definition: fact.definition,
      unitLabel: '项', status: 'available', result: '9 / 14 · 适用样本 14',
    });
  });

  it('keeps real zero as an available count and as an available ratio', () => {
    expect(presentPublicFact({...fact, value: 0, numerator: 0}, fact.metricKey).result)
      .toBe('0 / 14 · 适用样本 14');
    const {numerator: _numerator, denominator: _denominator, ...count} = fact;
    void _numerator; void _denominator;
    expect(presentPublicFact({...count, value: 0, sampleN: 0}, fact.metricKey))
      .toMatchObject({status: 'available', result: '0 项 · 适用样本 0'});
  });

  it.each([
    ['people', '人'], ['forms', '份'], ['assignments', '项'], ['alerts', '件'],
    ['interactions', '次'], ['doses', '剂'], ['hours', '小时'], ['days', '天'], ['records', '条'],
  ] as const)('presents the original count in %s without a fabricated denominator', (unit, label) => {
    expect(presentPublicFact({metricKey: fact.metricKey, label: fact.label, definition: fact.definition,
      unit, status: 'available', value: 1234.567}, fact.metricKey))
      .toMatchObject({status: 'available', unitLabel: label, result: `1,234.57 ${label}`});
  });

  it.each([
    ['suppressed', '已保护 · 本项不展示精确结果'],
    ['unknown', '证据不足 · 本项暂不能判断'],
    ['no_applicable', '本阶段无适用样本'],
  ] as const)('removes every numeric field from %s output before formatting', (status, result) => {
    const input = {...fact, status, value: 999, sampleN: 999, numerator: 999, denominator: 999,
      id: 'PRIVATE_FACT_ID', sourceRefs: ['PRIVATE_SOURCE']};
    const shown = presentPublicFact(input, fact.metricKey);
    expect(shown).toEqual({metricKey: fact.metricKey, label: fact.label, definition: fact.definition,
      unitLabel: '项', status, result});
    expect(JSON.stringify(shown)).not.toMatch(/999|PRIVATE_FACT_ID|PRIVATE_SOURCE/);
    for (const key of ['value', 'sampleN', 'numerator', 'denominator']) expect(shown).not.toHaveProperty(key);
    // Unavailable facts do not validate or expose numeric fields that are irrelevant to their state.
    expect(presentPublicFact({...input, value: Infinity, numerator: 'PRIVATE_NUMBER', sampleN: -1}, fact.metricKey))
      .toEqual(shown);
  });

  it.each([
    ['missing', undefined], ['null', null], ['array', []], ['primitive', 'PRIVATE_INPUT'],
    ['wrong key', {...fact, metricKey: 'other'}],
    ['empty label', {...fact, label: '  '}], ['wrong label type', {...fact, label: 12}],
    ['empty definition', {...fact, definition: ''}], ['wrong definition type', {...fact, definition: null}],
    ['unknown unit', {...fact, unit: 'PRIVATE_UNIT'}],
    ['prototype unit', {...fact, unit: '__proto__'}], ['inherited unit', {...fact, unit: 'constructor'}],
    ['unknown status', {...fact, status: 'PRIVATE_STATUS'}],
    ['missing value', {...fact, value: undefined}], ['null value', {...fact, value: null}],
    ['string value', {...fact, value: '999'}], ['NaN value', {...fact, value: NaN}],
    ['infinite value', {...fact, value: Infinity}],
    ['infinite numerator', {...fact, numerator: -Infinity}],
    ['infinite denominator', {...fact, denominator: Infinity}],
    ['missing numerator', {...fact, numerator: undefined}],
    ['missing denominator', {...fact, denominator: undefined}],
    ['string numerator', {...fact, numerator: '999'}],
    ['null denominator', {...fact, denominator: null}],
    ['negative sample', {...fact, sampleN: -1}], ['fractional sample', {...fact, sampleN: 1.5}],
    ['string sample', {...fact, sampleN: '999'}], ['infinite sample', {...fact, sampleN: Infinity}],
  ])('fails closed for %s without copying invalid input into the reading model', (_name, input) => {
    const shown = presentPublicFact(input, fact.metricKey);
    expect(shown).toMatchObject({...unreadable, metricKey: fact.metricKey});
    expect(JSON.stringify(shown)).not.toMatch(/999|PRIVATE|Infinity|NaN/);
    expect(shown.definition).toBeNull();
    expect(shown.unitLabel).toBeNull();
  });

  it('does not infer a different ratio from the supplied value', () => {
    expect(presentPublicFact({...fact, value: 0.123}, fact.metricKey).result)
      .toBe('9 / 14 · 适用样本 14');
  });

  it('does not mutate frozen input', () => {
    const input = Object.freeze({...fact});
    const before = structuredClone(input);
    presentPublicFact(input, fact.metricKey);
    expect(input).toEqual(before);
  });
});

describe('current report reading summary', () => {
  it('selects exactly four known metrics in fixed order from the complete 40-fact external report', () => {
    const report = publicReportFixture();
    const facts = report.content.chapters.flatMap(chapter => chapter.facts);
    expect(facts).toHaveLength(40);
    expect(new Set(facts.map(item => item.metricKey)).size).toBe(40);
    expect(buildReadingSummary(report.content).map(item => item.metricKey)).toEqual([
      'questionnaire_completion', 'contact_completion', 'education_completion', 'service_completion',
    ]);
    expect(READING_METRIC_KEYS).toEqual([
      'questionnaire_completion', 'contact_completion', 'education_completion', 'service_completion',
    ]);
    expect(buildReadingSummary(report.content).every(item => item.status === 'no_applicable')).toBe(true);
  });

  it('presents one current fact per state without mixing other catalog facts', () => {
    const report = publicReportFixture();
    const values: PublicFact[] = [
      {...fact, metricKey: 'questionnaire_completion', status: 'suppressed', value: 999},
      fact,
      {...fact, metricKey: 'education_completion', status: 'unknown', value: 999},
      {...fact, metricKey: 'service_completion', status: 'no_applicable', value: 999},
    ];
    for (const chapter of report.content.chapters) chapter.facts = chapter.facts
      .map(item => values.find(value => value.metricKey === item.metricKey) ?? item);
    const before = structuredClone(report);
    const shown = buildReadingSummary(report.content);
    expect(shown.map(item => item.status)).toEqual(['suppressed', 'available', 'unknown', 'no_applicable']);
    expect(shown[1].result).toBe('9 / 14 · 适用样本 14');
    expect(JSON.stringify(shown)).not.toMatch(/999|period_members|active_members/);
    expect(report).toEqual(before);
  });

  it.each(['missing', 'duplicate'])('marks a %s fact unreadable instead of choosing another report or the first duplicate', mode => {
    const report = publicReportFixture();
    for (const chapter of report.content.chapters) chapter.facts = chapter.facts
      .filter(item => item.metricKey !== fact.metricKey);
    if (mode === 'duplicate') report.content.chapters[0].facts.push(fact, {...fact, value: 999, numerator: 999});
    expect(buildReadingSummary(report.content).find(item => item.metricKey === fact.metricKey))
      .toMatchObject(unreadable);
  });

  it('does not cache previous reports or read the current allowed member count as a denominator', () => {
    const first = publicReportFixture(), next = publicReportFixture({id: 'R2', revision: 2});
    first.content.chapters[2].facts = first.content.chapters[2].facts
      .map(item => item.metricKey === fact.metricKey ? fact : item);
    next.content.chapters[2].facts = next.content.chapters[2].facts
      .map(item => item.metricKey === fact.metricKey ? {...fact, value: 5 / 12, numerator: 5, denominator: 12, sampleN: 12} : item);
    const overview = publicProjectFixture([next]);
    expect(overview.allowedMembers).toEqual({status: 'available', value: 14});
    expect(buildReadingSummary(first.content)[1].result).toBe('9 / 14 · 适用样本 14');
    expect(buildReadingSummary(next.content)[1].result).toBe('5 / 12 · 适用样本 12');
    for (const chapter of next.content.chapters) chapter.facts = chapter.facts
      .filter(item => item.metricKey !== fact.metricKey);
    expect(buildReadingSummary(next.content)[1]).toMatchObject(unreadable);
    expect(buildReadingSummary(first.content)[1].result).toBe('9 / 14 · 适用样本 14');
  });

  it.each([
    null, undefined, {}, {chapters: null}, {chapters: {}},
    {chapters: [null, {facts: null}, {facts: [null, {}, 'PRIVATE_FACT']} ]},
  ])('returns explicit unreadable items for a malformed external content collection: %j', content => {
    const shown = buildReadingSummary(content as ReadablePharmaReport['content']);
    expect(shown).toHaveLength(4);
    for (const item of shown) expect(item).toMatchObject(unreadable);
    expect(JSON.stringify(shown)).not.toContain('PRIVATE_FACT');
  });
});

describe('external report readability gate', () => {
  it.each(['delivered', 'accepted', 'client_changes_requested'] as const)('recognizes readable %s reports', status => {
    expect(isReadablePharmaReport(publicReportFixture({status}))).toBe(true);
  });

  it.each(['blocked', 'revoked'] as const)('rejects %s reports even if stale content is still attached', status => {
    const report: PharmaReportView = {...publicReportFixture(), gate: {status, reason: '访问已停止'}};
    expect(isReadablePharmaReport(report)).toBe(false);
  });

  it('rejects an available-shaped report without content', () => {
    const {content: _content, ...base} = publicReportFixture();
    void _content;
    const report: PharmaReportView = {...base, gate: {status: 'blocked', reason: '未交付'}};
    Object.assign(report, {gate: {status: 'available', reason: null}});
    expect(isReadablePharmaReport(report)).toBe(false);
  });

  it.each([null, undefined, 'PRIVATE_CONTENT', []])('rejects an available gate with unusable content: %j', content => {
    const report = Object.assign(publicReportFixture(), {content});
    expect(isReadablePharmaReport(report)).toBe(false);
  });
});

it('test fixtures retain an explicit empty report list and isolate mutations between calls', () => {
  const first = publicProjectFixture([]);
  expect(first.reports).toEqual([]);
  first.project.contactTargets.high = 999;
  expect(publicProjectFixture().project.contactTargets.high).toBe(2);
  const report = publicReportFixture();
  report.content.chapters[0].paragraphs.push('only this fixture');
  expect(publicReportFixture().content.chapters[0].paragraphs).not.toContain('only this fixture');
});
