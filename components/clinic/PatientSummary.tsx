import type { Patient } from "@/lib/domain/types";
import { currentHer2 } from "@/lib/domain/her2";
import { currentTreatments, displayName, stageLabel } from "@/lib/patient/display";
import { HER2_LABEL } from "@/lib/clinic/labels";
const yes = (v: boolean) => (v ? <span className="text-green-700">已同意</span> : <span className="text-gray-400">未同意</span>);
const GENO = { positive: "阳性", negative: "阴性", mutated: "突变", wild: "野生型", not_tested: "未检" } as const;
/** 基本信息 + 同意状态 */
export function PatientSummary({ p }: { p: Patient }) {
  const tx = currentTreatments(p);
  const rows: [string, React.ReactNode][] = [
    ["年龄", `${p.age} 岁`], ["阶段", stageLabel(p.stage)], ["入组日期", p.enrolledAt], ["手术日期", p.surgeryDate ?? "—"],
    ["当前 HER2", HER2_LABEL[currentHer2(p.biomarkers)]], ["当前治疗", tx.length ? tx.join(" + ") : "—"], ["最近联系", p.lastContact],
    ["基因检测", `BRCA ${GENO[p.genomics.brca]} · PIK3CA ${GENO[p.genomics.pik3ca]} · ESR1 ${GENO[p.genomics.esr1]}`],
  ];
  return (
    <div className="grid grid-cols-2 gap-6 text-sm">
      <div>
        <p className="mb-2 text-base font-semibold">{displayName(p.id)} <span className="text-sm font-normal text-gray-400">{p.id}</span>{p.anchorKey !== null && <span className="ml-2 rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700">锚点</span>}</p>
        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd>{v}</dd></div>)}</dl>
        {p.expertNote && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">{p.expertNote}</p>}
      </div>
      <div>
        <p className="mb-2 font-medium text-gray-700">同意状态</p>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
          <dt className="text-gray-500">随访管理</dt><dd>{yes(p.consent.followUp)}</dd>
          <dt className="text-gray-500">科研使用</dt><dd>{yes(p.consent.research)}</dd>
          <dt className="text-gray-500">药企去标识化</dt><dd>{yes(p.consent.pharmaDeidentified)}</dd>
          <dt className="text-gray-500">签署日期</dt><dd>{p.consent.signedAt ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
