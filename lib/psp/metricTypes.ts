export const PSP_METRIC_ALGORITHM_VERSION = 'psp-metrics-v1' as const;

export type MetricOptions = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
  scope: 'internal' | 'aggregate';
  ledgerRevision: number;
};

export type Metric = {
  key: string;
  label: string;
  unit: 'people' | 'forms' | 'assignments' | 'alerts' | 'interactions' | 'doses' | 'hours' | 'days' | 'records';
  sampleUnit: 'people' | 'forms' | 'assignments' | 'alerts' | 'interactions' | 'records';
  sampleN: number | null;
  numerator?: number;
  denominator?: number;
  value: number | null;
  status: 'available' | 'no_applicable' | 'unknown';
  sourceRefs: string[];
  complementCells?: number[];
  window: MetricOptions;
  applicability: string;
  algorithmVersion: typeof PSP_METRIC_ALGORITHM_VERSION;
};
