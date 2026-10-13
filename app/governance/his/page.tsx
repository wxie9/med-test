const INTERFACES = [
  { name: "HIS 患者主索引", desc: "患者身份、就诊号与院区映射" },
  { name: "EMR 病理报告", desc: "病理/免疫组化结构化报告" },
  { name: "LIS 检验", desc: "血常规、肝肾功能等检验结果" },
];
export default function HisPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">HIS 接口 <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">[模拟]</span></h1>
      <p className="text-sm text-gray-500">本页为模拟页面：演示环境不连接任何医院信息系统，所有数据均为合成数据。</p>
      <div className="grid grid-cols-3 gap-4">
        {INTERFACES.map(i => (
          <section key={i.name} data-testid="his-card" className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-base font-semibold">{i.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{i.desc}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-gray-700"><span className="inline-block h-2 w-2 rounded-full bg-gray-400" />演示环境：未连接（计划 Phase 2）</p>
          </section>
        ))}
      </div>
    </div>
  );
}
