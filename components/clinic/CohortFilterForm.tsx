"use client";
import { CURRENT_TYPE_OPTIONS, HER2_OPTIONS, STAGE_OPTIONS, toggle, type CohortFormState } from "@/lib/clinic/cohortFilter";
import { stageLabel } from "@/lib/patient/display";
function Box({ testId, label, checked, onChange }: { testId: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
      <input type="checkbox" data-testid={testId} checked={checked} onChange={onChange} className="accent-pink-600" />{label}
    </label>
  );
}
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-gray-800">{title}{hint && <span className="ml-2 text-xs font-normal text-gray-400">{hint}</span>}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
/** Checkbox filter form; empty groups and unchecked boxes mean "no constraint". */
export function CohortFilterForm({ value, onChange }: { value: CohortFormState; onChange: (v: CohortFormState) => void }) {
  const set = (patch: Partial<CohortFormState>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <Group title="激素受体" hint="不勾选 = 不限">
        <Box testId="f-hrpos" label="HR 阳性" checked={value.hrPositive} onChange={() => set({ hrPositive: !value.hrPositive })} />
      </Group>
      <Group title="HER2 分类" hint="按最新标本判定；不勾选 = 不限">
        {HER2_OPTIONS.map(o => <Box key={o.value} testId={`f-her2-${o.value}`} label={o.label} checked={value.her2.includes(o.value)} onChange={() => set({ her2: toggle(value.her2, o.value) })} />)}
      </Group>
      <Group title="阶段" hint="不勾选 = 不限">
        {STAGE_OPTIONS.map(s => <Box key={s} testId={`f-stage-${s}`} label={stageLabel(s)} checked={value.stage.includes(s)} onChange={() => set({ stage: toggle(value.stage, s) })} />)}
      </Group>
      <Group title="既往治疗" hint="不勾选 = 不限">
        <Box testId="f-cdk46" label="CDK4/6 经治" checked={value.priorCdk46} onChange={() => set({ priorCdk46: !value.priorCdk46 })} />
      </Group>
      <Group title="当前治疗类型" hint="任一在用即匹配；不勾选 = 不限">
        {CURRENT_TYPE_OPTIONS.map(o => <Box key={o.value} testId={`f-cur-${o.value}`} label={o.label} checked={value.currentTreatmentType.includes(o.value)} onChange={() => set({ currentTreatmentType: toggle(value.currentTreatmentType, o.value) })} />)}
      </Group>
    </div>
  );
}
