export default function SandboxPage() {
  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="text-lg font-semibold">分析沙箱 <span className="text-sm font-normal text-gray-400">[后续]</span></h1>
      <p className="text-sm text-gray-600">本演示版未开放分析沙箱。后续版本将在受控环境中提供基于研究快照的自定义分析：</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
        <li>只读访问去标识化快照，不可下载患者级数据；</li>
        <li>分析脚本与结果留痕，导出前需经数据治理方审核；</li>
        <li>小样本单元格自动抑制，避免再识别风险。</li>
      </ul>
      <p className="text-xs text-gray-400">当前请使用左侧的概览、治疗模式、入组可行性与依从性四个预置用例。</p>
    </div>
  );
}
