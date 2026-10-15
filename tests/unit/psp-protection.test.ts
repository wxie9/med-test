import {expect,it} from 'vitest';
import {protectMetric,protectMetricGroups,PSP_PROTECTION_VERSION} from '@/lib/psp/protection';
import type {Metric} from '@/lib/psp/metricTypes';

const metric=(key:string,overrides:Partial<Metric>={}):Metric=>({
 key,label:`${key} internal 1/14`,unit:'forms',sampleUnit:'forms',sampleN:14,
 numerator:0,denominator:14,value:0,status:'available',
 sourceRefs:['private:source-1'],complementCells:[0,14],
 window:{projectId:'P',periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:'2026-10-13T10:00:00+08:00',scope:'aggregate',ledgerRevision:42},
 applicability:'未可用计划 3 项，有效成员-日 2 条',algorithmVersion:'psp-metrics-v1',
 ...overrides,
});
const byKey=(metrics:ReturnType<typeof protectMetricGroups>,key:string)=>metrics.find(m=>m.key===key)!;
const exactFields=['sampleN','sampleUnit','numerator','denominator','value','sourceRefs','complementCells','applicability','label','window','algorithmVersion'];
const noExact=(result:unknown)=>{
 for(const field of exactFields)expect(result).not.toHaveProperty(field);
};
const count=(key:string,value:number,sampleN=14,unit:Metric['unit']='alerts'):Metric=>metric(key,{unit,sampleUnit:unit as Metric['sampleUnit'],sampleN,value,numerator:undefined,denominator:undefined,complementCells:undefined});

it('protects unknown before any zero or denominator inference',()=>{
 const result=protectMetric(metric('questionnaire_completion',{status:'unknown',value:null,sampleN:null,denominator:0,numerator:0,complementCells:undefined}));
 expect(result).toEqual({key:'questionnaire_completion',unit:'forms',status:'unknown',reason:'结果尚不可确定'});
 noExact(result);
});

it('classifies known empty samples and zero denominators as no applicable',()=>{
 for(const input of [metric('empty_count',{sampleN:0,value:0,numerator:undefined,denominator:undefined,complementCells:undefined}),metric('empty_ratio',{sampleN:0,denominator:0,value:null,complementCells:[0,0]})]){
  const result=protectMetric(input);
  expect(result).toEqual({key:input.key,unit:input.unit,status:'no_applicable',reason:'当前窗口无适用样本'});
  noExact(result);
 }
});

it('suppresses a four-item sample and a nonzero one-in-fourteen result but allows the zero and five-item boundaries',()=>{
 const four=protectMetric(metric('four',{sampleN:4,numerator:0,denominator:4,complementCells:[0,4]}));
 expect(four).toEqual({key:'four',unit:'forms',status:'suppressed',reason:'样本量少于5'});
 noExact(four);
 const one=protectMetric(metric('pro_completion',{numerator:1,value:1/14,complementCells:[1,13]}));
 expect(one).toEqual({key:'pro_completion',unit:'forms',status:'suppressed',reason:'存在少于5的非零结果格'});
 noExact(one);
 expect(protectMetric(metric('five',{sampleN:5,denominator:5,complementCells:[0,5]}))).toEqual({key:'five',unit:'forms',sampleUnit:'forms',status:'available',sampleN:5,numerator:0,denominator:5,value:0});
 expect(protectMetric(metric('zero_of_fourteen'))).toEqual({key:'zero_of_fourteen',unit:'forms',sampleUnit:'forms',status:'available',sampleN:14,numerator:0,denominator:14,value:0});
});

it('checks duration sample size and omits private fields from available projection',()=>{
 const small=protectMetric(metric('alert_accept_p50',{unit:'hours',sampleUnit:'alerts',sampleN:2,value:3,numerator:undefined,denominator:undefined,complementCells:undefined}));
 expect(small.status).toBe('suppressed');noExact(small);
 const available=protectMetric(metric('alert_accept_p50',{unit:'hours',sampleUnit:'alerts',sampleN:5,value:3,numerator:undefined,denominator:undefined,complementCells:undefined}));
 expect(available).toEqual({key:'alert_accept_p50',unit:'hours',sampleUnit:'alerts',status:'available',sampleN:5,value:3});
});

it('derives ratio complement cells when the upstream metric omitted them',()=>{
 const result=protectMetric(metric('contact_completion',{numerator:1,denominator:14,value:1/14,complementCells:undefined}));
 expect(result).toEqual({key:'contact_completion',unit:'forms',status:'suppressed',reason:'存在少于5的非零结果格'});
 noExact(result);
 expect(protectMetric(metric('contact_completion',{numerator:1,denominator:14,value:1/14,complementCells:[]})).status).toBe('suppressed');
});

it('suppresses a complete interaction table when one category is small, even without complementCells',()=>{
 const metrics=[
  metric('interaction_attempts',{unit:'interactions',sampleUnit:'interactions',sampleN:19,value:19,numerator:undefined,denominator:undefined,complementCells:undefined}),
  metric('interaction_successes',{unit:'interactions',sampleUnit:'interactions',sampleN:19,value:9,numerator:undefined,denominator:undefined,complementCells:undefined}),
  metric('interaction_no_answer',{unit:'interactions',sampleUnit:'interactions',sampleN:19,value:1,numerator:undefined,denominator:undefined,complementCells:undefined}),
  metric('interaction_refused',{unit:'interactions',sampleUnit:'interactions',sampleN:19,value:9,numerator:undefined,denominator:undefined,complementCells:undefined}),
  metric('interaction_channel_unavailable',{unit:'interactions',sampleUnit:'interactions',sampleN:19,value:0,numerator:undefined,denominator:undefined,complementCells:undefined}),
  metric('quality_contact_channel',{unit:'records',sampleUnit:'records',sampleN:19,value:0,complementCells:[0,19]}),
 ];
 for(const output of protectMetricGroups(metrics,[])){expect(output.status).toBe('suppressed');noExact(output);}
 expect(protectMetric(metrics[2])).toMatchObject({status:'suppressed'});
});

it('does not interpret a count of three days as a category of three people',()=>{
 const result=protectMetric(metric('self_report_days',{unit:'days',sampleUnit:'people',sampleN:14,value:3,numerator:undefined,denominator:undefined,complementCells:undefined}));
 expect(result).toEqual({key:'self_report_days',unit:'days',sampleUnit:'people',status:'available',sampleN:14,value:3});
});

it('hides a carry-over subset of one and its complete family',()=>{
 const outputs=protectMetricGroups([count('alert_carry_over',14),count('alert_carry_over_contacted',1),count('alert_carry_over_reviewed',0)],[]);
 expect(outputs.map(item=>item.status)).toEqual(['suppressed','suppressed','suppressed']);
 for(const output of outputs)noExact(output);
});

it('hides a carry-over complement of one and allows the zero and five boundaries',()=>{
 expect(protectMetric(count('alert_carry_over_contacted',13))).toMatchObject({status:'suppressed'});
 expect(protectMetric(count('alert_carry_over_contacted',0))).toMatchObject({status:'available',value:0,sampleN:14});
 expect(protectMetric(count('alert_carry_over_contacted',5))).toMatchObject({status:'available',value:5,sampleN:14});
});

it('protects early completion and current-alert subset counts on both sides',()=>{
 for(const key of ['questionnaire_early_completed','contact_early_completed','education_early_completed','alert_pending','alert_due_uncontacted','alert_review_pending']){
  for(const value of [1,13]){
   const output=protectMetric(count(key,value,14,key.includes('early')?'assignments':'alerts'));
   expect(output.status,`${key}=${value}/14`).toBe('suppressed');
   noExact(output);
  }
 }
});

it('fails closed on malformed available numeric fields',()=>{
 const malformed=[
  metric('nan_numerator',{numerator:Number.NaN,complementCells:undefined}),
  metric('infinite_denominator',{denominator:Infinity,complementCells:undefined}),
  metric('too_large_numerator',{numerator:20,value:0,complementCells:undefined}),
  metric('fractional_sample',{sampleN:5.5,denominator:14,complementCells:[0,14]}),
  metric('negative_value',{value:-1,complementCells:undefined}),
  metric('invalid_cell',{complementCells:[Number.NaN,14]}),
  count('over_sample',15),
  metric('fractional_days',{unit:'days',sampleUnit:'people',sampleN:14,value:2.5,numerator:undefined,denominator:undefined,complementCells:undefined}),
 ];
 for(const input of malformed){
  const output=protectMetric(input);
  expect(output.status,input.key).toBe('unknown');
  noExact(output);
 }
});

it('applies default families even when caller passes no relations',()=>{
 const metrics=[metric('questionnaire_completion',{numerator:1,value:1/14,complementCells:[1,13]}),metric('questionnaire_on_time')];
 expect(protectMetricGroups(metrics,[]).map(m=>m.status)).toEqual(['suppressed','suppressed']);
 const unknown=[metric('questionnaire_completion',{status:'unknown',sampleN:null,value:null,numerator:undefined,denominator:undefined,complementCells:undefined}),metric('questionnaire_on_time')];
 expect(protectMetricGroups(unknown,[]).map(m=>m.status)).toEqual(['unknown','suppressed']);
});

it('applies the built-in service total relation without caller relations',()=>{
 const outputs=protectMetricGroups([
  metric('contact_completion',{numerator:1,value:1/14,complementCells:[1,13]}),
  metric('education_completion'),
  metric('service_completion',{sampleN:28,numerator:15,denominator:28,value:15/28,complementCells:[15,13]}),
 ],[]);
 expect(byKey(outputs,'service_completion').status).toBe('suppressed');
 noExact(byKey(outputs,'service_completion'));
});

it('propagates suppression through two levels of additive totals independent of relation and metric order',()=>{
 const source=[
  metric('pro_completion',{numerator:1,value:1/14,complementCells:[1,13]}),
  metric('contact_completion',{numerator:9,value:9/14,complementCells:[9,5]}),
  metric('education_completion',{numerator:9,value:9/14,complementCells:[9,5]}),
  metric('service_total',{sampleN:42,numerator:19,denominator:42,value:19/42,complementCells:[19,23]}),
  metric('grand_total',{sampleN:56,numerator:28,denominator:56,value:.5,complementCells:[28,28]}),
 ];
 const relations=[{totalKey:'grand_total',componentKeys:['service_total','contact_completion']},{totalKey:'service_total',componentKeys:['pro_completion','contact_completion','education_completion']}];
 for(const result of [protectMetricGroups(source,relations),protectMetricGroups([...source].reverse(),[...relations].reverse())]){
  expect(byKey(result,'service_total').status).toBe('suppressed');
  expect(byKey(result,'grand_total').status).toBe('suppressed');
  for(const m of result.filter(m=>m.status!=='available'))noExact(m);
  expect(JSON.stringify(result)).not.toContain('19/42');
 }
});

it('uses fixed reasons, validates input, and returns a detached deterministic whitelist',()=>{
 expect(PSP_PROTECTION_VERSION).toBe('psp-k5-v1');
 const input=metric('safe');
 const first=protectMetricGroups([input]);
 expect(first).toEqual(protectMetricGroups([input]));
 expect(JSON.stringify(first)).not.toContain('未可用计划');
 input.sourceRefs.push('new-source');input.applicability='changed';
 expect(first).toEqual(protectMetricGroups([input]));
 expect(()=>protectMetricGroups([input,input])).toThrow(/duplicate/i);
 expect(()=>protectMetric(input,0)).toThrow(/k/i);
 expect(()=>protectMetricGroups([input],[{totalKey:'safe',componentKeys:[]}])).toThrow(/relation/i);
 expect(protectMetric(metric('custom',{sampleN:6,denominator:6,complementCells:[0,6]}),7)).toMatchObject({status:'suppressed',reason:'样本量少于7'});
});
