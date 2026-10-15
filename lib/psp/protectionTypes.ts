import type {Metric} from './metricTypes';

export type ProtectedMetric =
 | {key:string;unit:Metric['unit'];sampleUnit:Metric['sampleUnit'];status:'available';sampleN:number;numerator?:number;denominator?:number;value:number}
 | {key:string;unit:Metric['unit'];status:'no_applicable'|'unknown'|'suppressed';reason:string};

/** A total whose numerator and denominator can reveal a hidden component. */
export type MetricRelation = {totalKey:string;componentKeys:string[]};
