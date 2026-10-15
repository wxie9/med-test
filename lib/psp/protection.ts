import type {Metric} from './metricTypes';
import type {MetricRelation,ProtectedMetric} from './protectionTypes';

export type {MetricRelation,ProtectedMetric} from './protectionTypes';
export const PSP_PROTECTION_VERSION='psp-k5-v1' as const;

const REASONS={
 unknown:'结果尚不可确定',
 no_applicable:'当前窗口无适用样本',
 group:'相关指标含受保护或未知结果',
 total:'合计可能反推受保护分项',
} as const;

// These keys share a cohort or form one table. They are not claims that every
// value in a family is additive.
const DEFAULT_FAMILIES:readonly (readonly string[])[]=[
 ['questionnaire_completion','questionnaire_on_time'],
 ['alert_contact_coverage','alert_contact_on_time','alert_pending','alert_due_uncontacted','alert_accept_p50','alert_accept_p90','alert_contact_p50','alert_contact_p90','alert_review_completion','alert_review_pending'],
 ['alert_carry_over','alert_carry_over_contacted','alert_carry_over_reviewed'],
 ['interaction_attempts','interaction_successes','interaction_no_answer','interaction_refused','interaction_channel_unavailable','quality_contact_channel','quality_contact_outcome','quality_contact_occurred_at','quality_contact_recorded_at','quality_contact_actor','quality_contact_source_link'],
 ['self_report_ratio','self_report_people','self_report_days'],
 ['stop_intent_ratio','quality_questionnaire_stop_intent'],
];
const DEFAULT_RELATIONS:readonly MetricRelation[]=[
 {totalKey:'service_completion',componentKeys:['contact_completion','education_completion']},
 {totalKey:'interaction_attempts',componentKeys:['interaction_successes','interaction_no_answer','interaction_refused','interaction_channel_unavailable']},
];
function checkK(k:number):void{
 if(!Number.isSafeInteger(k)||k<1)throw new RangeError('k must be a positive safe integer');
}
function hidden(metric:Metric,status:'unknown'|'no_applicable'|'suppressed',reason:string):ProtectedMetric{
 return {key:metric.key,unit:metric.unit,status,reason};
}
function smallNonzero(value:number,k:number):boolean{return value>0&&value<k;}
type NumericallyAvailableMetric=Metric&{sampleN:number;value:number};
function validAvailableNumbers(metric:Metric):metric is NumericallyAvailableMetric{
 const {sampleN,value,numerator,denominator,complementCells}=metric;
 if(sampleN===null||!Number.isSafeInteger(sampleN)||sampleN<0||value===null||!Number.isFinite(value)||value<0)return false;
 if(complementCells!==undefined&&(!Array.isArray(complementCells)||complementCells.some(cell=>!Number.isSafeInteger(cell)||cell<0)))return false;
 if((numerator===undefined)!==(denominator===undefined))return false;
 if(numerator!==undefined&&denominator!==undefined){
  if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||numerator<0||denominator<=0||numerator>denominator)return false;
  if(Math.abs(value-numerator/denominator)>1e-9)return false;
 }else{
  if(metric.unit!=='hours'&&!Number.isSafeInteger(value))return false;
  // A count in the sample's own unit is a subset of that sample. Both the
  // observed and complementary categories must be valid whole counts.
  if(metric.unit===metric.sampleUnit&&value>sampleN)return false;
 }
 return true;
}

/** Single-metric protection; external collections must use protectMetricGroups. */
export function protectMetric(metric:Metric,k=5):ProtectedMetric{
 checkK(k);
 if(metric.status==='unknown')return hidden(metric,'unknown',REASONS.unknown);
 if(metric.status==='no_applicable'||metric.sampleN===0||metric.denominator===0)return hidden(metric,'no_applicable',REASONS.no_applicable);
 // Malformed available values must not reach the public projection. This
 // includes optional fields and cells, which TypeScript's number cannot guard.
 if(!validAvailableNumbers(metric))return hidden(metric,'unknown',REASONS.unknown);
 if(metric.sampleN<k)return hidden(metric,'suppressed',`样本量少于${k}`);
 const derived=metric.numerator!==undefined&&metric.denominator!==undefined?[metric.numerator,metric.denominator-metric.numerator]:[];
 const subset=metric.numerator===undefined&&metric.denominator===undefined&&metric.unit===metric.sampleUnit?[metric.value,metric.sampleN-metric.value]:[];
 const cells=[...(metric.complementCells??[]),...derived,...subset];
 if(cells.some(cell=>smallNonzero(cell,k)))return hidden(metric,'suppressed',`存在少于${k}的非零结果格`);
 return {
  key:metric.key,unit:metric.unit,sampleUnit:metric.sampleUnit,status:'available',sampleN:metric.sampleN,
  ...(metric.numerator!==undefined?{numerator:metric.numerator}:{}),
  ...(metric.denominator!==undefined?{denominator:metric.denominator}:{}),value:metric.value,
 };
}

function validateRelations(relations:readonly MetricRelation[]):void{
 for(const relation of relations){
  if(!relation||typeof relation.totalKey!=='string'||!relation.totalKey||!Array.isArray(relation.componentKeys)||!relation.componentKeys.length||relation.componentKeys.some(key=>typeof key!=='string'||!key||key===relation.totalKey)||new Set(relation.componentKeys).size!==relation.componentKeys.length){
   throw new TypeError('invalid metric relation');
  }
 }
}

/** Protect related measures together, including built-in families and totals. */
export function protectMetricGroups(metrics:Metric[],relations:MetricRelation[]=[],k=5):ProtectedMetric[]{
 checkK(k);
 const keys=new Set<string>();
 for(const metric of metrics){if(keys.has(metric.key))throw new TypeError(`duplicate metric key: ${metric.key}`);keys.add(metric.key);}
 validateRelations(relations);
 const output=new Map(metrics.map(metric=>[metric.key,protectMetric(metric,k)]));
 const suppress=(key:string,reason:string):boolean=>{
  const current=output.get(key);
  if(!current||current.status!=='available')return false;
  const source=metrics.find(metric=>metric.key===key)!;
  output.set(key,hidden(source,'suppressed',reason));
  return true;
 };
 // A family member with unknown or suppressed precision can expose its shared
 // denominator through another available member. Fixed-point propagation also
 // handles totals reached through multiple relations in any caller order.
 let changed:boolean;
 do{
  changed=false;
  for(const family of DEFAULT_FAMILIES){
   if(family.some(key=>{const status=output.get(key)?.status;return status==='unknown'||status==='suppressed';})){
    for(const key of family)changed=suppress(key,REASONS.group)||changed;
   }
  }
  for(const relation of [...DEFAULT_RELATIONS,...relations]){
   if(relation.componentKeys.some(key=>{const status=output.get(key)?.status;return status==='unknown'||status==='suppressed';})){
    changed=suppress(relation.totalKey,REASONS.total)||changed;
   }
  }
 }while(changed);
 return metrics.map(metric=>output.get(metric.key)!);
}
