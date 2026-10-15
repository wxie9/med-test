import {z} from 'zod';
import type {MetricOptions} from './metricTypes';
import type {Metric} from './metricTypes';
import type {ProtectedMetric} from './protectionTypes';
import type {PspProject} from './types';

export type SnapshotWindow=Pick<MetricOptions,'periodStart'|'periodEnd'|'cutoffAt'>;
export type SnapshotScope='internal'|'aggregate';
export type SnapshotSourceKind='enrollment'|'membership'|'permission'|'assignment'|'assignmentCancellation'|'contact'|'correction'|'questionnaireEvidence'|'alertBirth'|'alertAction'|'educationContent'|'educationEvent'|'educationResult'|'selfReport';
export type SnapshotSource={kind:SnapshotSourceKind;ref:string;locator:string;value:Record<string,unknown>};
export type SnapshotCohortQualification={ref:string;basis:'cutoff_grant'}|{ref:string;basis:'historical_result';sourceRef:string}|{ref:string;basis:'legacy_gap';firstValidSubmittedAt:string;witnessAt:string;witnessSequence:number;firstTypedSourceRef?:string};
export type SnapshotMetricEvidence={scope:SnapshotScope;metricKey:string;sourceRefs:string[];cohortRefs:string[];cohortQualifications:SnapshotCohortQualification[];supportingRefs:string[]};
export type PspServiceSnapshot={id:string;version:1;projectId:string;project:PspProject;seedVersion:number;createdAt:string;createdBy:string;sourceLedgerRevision:number;authorizationVersionAtFreeze:number;window:SnapshotWindow;algorithmVersion:'psp-metrics-v1';protectionVersion:'psp-k5-v1';internalMetrics:Metric[];aggregateMetrics:Metric[];protectedMetrics:ProtectedMetric[];sources:SnapshotSource[];evidence:SnapshotMetricEvidence[];contentDigest:string};
export type PspSnapshotSummary=Pick<PspServiceSnapshot,'id'|'projectId'|'window'|'createdAt'|'createdBy'|'sourceLedgerRevision'>;
export type PspSnapshotList={project:PspProject;serverNow:string;seedVersion:number;ledgerRevision:number;authorizationVersion:number;summaries:PspSnapshotSummary[]};
export type PspSnapshotDetail={snapshot:PspServiceSnapshot;seedVersion:number;ledgerRevision:number;serverNow:string};
export type PspMetricEvidence={snapshotId:string;scope:SnapshotScope;metric:Metric;sourceRefs:string[];cohortRefs:string[];cohortQualifications:SnapshotCohortQualification[];supportingRefs:string[];sources:SnapshotSource[];seedVersion:number};

const id=z.string().min(1),time=z.string().datetime({offset:true}),nonnegative=z.number().int().nonnegative();
const value=z.record(z.string(),z.unknown());
export const SnapshotSourceSchema=z.object({kind:z.enum(['enrollment','membership','permission','assignment','assignmentCancellation','contact','correction','questionnaireEvidence','alertBirth','alertAction','educationContent','educationEvent','educationResult','selfReport']),ref:id,locator:id,value}).strict();
export const SnapshotWindowSchema=z.object({periodStart:time,periodEnd:time,cutoffAt:time}).strict();
const SnapshotCohortQualificationSchema=z.discriminatedUnion('basis',[
 z.object({ref:id,basis:z.literal('cutoff_grant')}).strict(),
 z.object({ref:id,basis:z.literal('historical_result'),sourceRef:id}).strict(),
 z.object({ref:id,basis:z.literal('legacy_gap'),firstValidSubmittedAt:time,witnessAt:time,witnessSequence:z.number().int().nonnegative(),firstTypedSourceRef:id.optional()}).strict(),
]);
export const SnapshotMetricEvidenceSchema=z.object({scope:z.enum(['internal','aggregate']),metricKey:id,sourceRefs:z.array(id),cohortRefs:z.array(id),cohortQualifications:z.array(SnapshotCohortQualificationSchema),supportingRefs:z.array(id)}).strict();
const MetricSchema=z.object({key:id,label:id,unit:z.enum(['people','forms','assignments','alerts','interactions','doses','hours','days','records']),sampleUnit:z.enum(['people','forms','assignments','alerts','interactions','records']),sampleN:nonnegative.nullable(),numerator:z.number().optional(),denominator:z.number().optional(),value:z.number().nullable(),status:z.enum(['available','no_applicable','unknown']),sourceRefs:z.array(id),complementCells:z.array(z.number()).optional(),window:z.object({projectId:id,periodStart:time,periodEnd:time,cutoffAt:time,scope:z.enum(['internal','aggregate']),ledgerRevision:nonnegative}).strict(),applicability:z.string(),algorithmVersion:z.literal('psp-metrics-v1')}).strict();
const ProtectedSchema=z.union([z.object({key:id,unit:MetricSchema.shape.unit,sampleUnit:MetricSchema.shape.sampleUnit,status:z.literal('available'),sampleN:nonnegative,numerator:z.number().optional(),denominator:z.number().optional(),value:z.number()}).strict(),z.object({key:id,unit:MetricSchema.shape.unit,status:z.enum(['no_applicable','unknown','suppressed']),reason:id}).strict()]);
export const PspServiceSnapshotSchema=z.object({id,version:z.literal(1),projectId:id,project:z.object({id,title:id,sponsor:id,scope:id,population:id,startsAt:time,endsAt:time,period:id,cutoffAt:time,configVersion:z.number().int().positive(),status:z.literal('active'),contactTargets:z.object({high:z.number().positive(),medium:z.number().positive()}).strict()}).strict(),seedVersion:z.number().int().positive(),createdAt:time,createdBy:id,sourceLedgerRevision:nonnegative,authorizationVersionAtFreeze:z.number().int().positive(),window:SnapshotWindowSchema,algorithmVersion:z.literal('psp-metrics-v1'),protectionVersion:z.literal('psp-k5-v1'),internalMetrics:z.array(MetricSchema),aggregateMetrics:z.array(MetricSchema),protectedMetrics:z.array(ProtectedSchema),sources:z.array(SnapshotSourceSchema),evidence:z.array(SnapshotMetricEvidenceSchema),contentDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
