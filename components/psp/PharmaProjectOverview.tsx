import Link from 'next/link';
import type {PharmaProjectView} from '@/lib/psp/pharmaView';
import {formatPspTime} from './Common';
import {isReadablePharmaReport} from './pharmaReadingModel';

const reportStates = {
  delivered: {label: '已交付，待客户反馈', action: '查看本次交付'},
  accepted: {label: '客户已验收', action: '查看验收记录'},
  client_changes_requested: {label: '客户已请求修改', action: '查看修改请求'},
};
const entryClass = 'inline-block max-w-full rounded border border-pink-600 bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-700';
const secondaryLinkClass = 'inline-block max-w-full text-sm text-gray-700 underline underline-offset-2 hover:text-pink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-700';

export function PharmaProjectOverview({view}: {view: PharmaProjectView}) {
  const {project, allowedMembers} = view;
  // Keep the projection's order and never select another revision as a fallback.
  const reports = view.reports.filter(report => report.status === 'delivered'
    || report.status === 'accepted' || report.status === 'client_changes_requested');

  return <article data-testid="psp-pharma-project-overview" className="min-w-0 space-y-6 break-words">
    <header className="space-y-2">
      <h2 className="text-lg font-semibold">{project.title}</h2>
      <p className="text-sm text-gray-600">合成数据 · 虚构项目</p>
      <p className="text-sm text-gray-700">资助方：{project.sponsor}</p>
      <p className="max-w-prose text-sm text-gray-700">{project.scope} · 服务人群：{project.population}</p>
    </header>
    <section aria-labelledby="pharma-service-scope" className="min-w-0 space-y-3">
      <h3 id="pharma-service-scope" className="font-semibold">本演示支持的服务内容</h3>
      <ul className="grid gap-x-8 gap-y-3 text-sm leading-6 sm:grid-cols-2">
        <li className="min-w-0"><span className="font-medium">计划问卷</span><p className="text-gray-700">按项目固定计划收集患者反馈。</p></li>
        <li className="min-w-0"><span className="font-medium">服务联系</span><p className="text-gray-700">记录联系尝试与实际联系结果。</p></li>
        <li className="min-w-0"><span className="font-medium">必要时医生复核</span><p className="text-gray-700">由医生复核预警与服务记录。</p></li>
        <li className="min-w-0"><span className="font-medium">批准教育及患者反馈</span><p className="text-gray-700">提供已批准资料，记录阅读与教育反馈。</p></li>
      </ul>
    </section>
    <section aria-labelledby="pharma-project-period" className="min-w-0 space-y-2 border-t border-gray-200 pt-5 text-sm">
      <h3 id="pharma-project-period" className="text-base font-semibold">周期与阶段</h3>
      <p className="text-gray-600">以下时间均为上海时间。</p>
      <p>服务周期：{formatPspTime(project.startsAt)} — {formatPspTime(project.endsAt)}</p>
      <p>阶段：{project.period} · 数据截止：{formatPspTime(project.cutoffAt)}</p>
      <p className="max-w-prose text-gray-700">本阶段仅描述截至上述时点的服务记录，完整统计窗口以各版固定报告为准。</p>
      <p className="text-gray-700">联系目标（演示配置，模拟自然小时）：高 {project.contactTargets.high} 小时 / 中 {project.contactTargets.medium} 小时</p>
    </section>
    <section aria-labelledby="pharma-delivery-scope" className="min-w-0 space-y-3 border-t border-gray-200 pt-5 text-sm">
      <h3 id="pharma-delivery-scope" className="text-base font-semibold">本阶段交付构成</h3>
      <p className="max-w-prose text-gray-700">本项目的交付材料包括以下内容；是否已交付，以各版报告状态为准。</p>
      <ul className="list-inside list-disc space-y-1 text-gray-700">
        <li>受保护阶段报告</li><li>数据与医学签署记录</li>
        <li>固定文本 / HTML 文件</li><li>下一期服务安排与客户反馈</li>
      </ul>
    </section>
    <section aria-labelledby="pharma-delivered-reports" className="min-w-0 space-y-4 border-t border-gray-200 pt-5">
      <h3 id="pharma-delivered-reports" className="font-semibold">项目报告</h3>
      {reports.length === 0 ? <p className="max-w-prose text-sm leading-6 text-gray-700">本阶段尚无已交付报告。完成双审核并由项目经理交付后可在此查看。</p>
        : <ul className="divide-y divide-gray-200 text-sm">{reports.map(report => {
          const state = report.status === 'accepted' ? reportStates.accepted
            : report.status === 'client_changes_requested' ? reportStates.client_changes_requested : reportStates.delivered;
          const href = `/pharma/projects/${encodeURIComponent(project.id)}/reports/${encodeURIComponent(report.id)}`;
          return <li key={report.id} className="min-w-0 space-y-3 py-4 first:pt-0 last:pb-0">
            {isReadablePharmaReport(report) ? <>
              <h4 className="font-medium">修订 {report.revision} · {state.label}</h4>
              <p>{report.content.title}</p>
              <p className="text-gray-700">阶段截止：{formatPspTime(report.window.cutoffAt)}（上海时间）</p>
              <Link className={entryClass} href={href}>{state.action} · 修订 {report.revision}</Link>
            </> : <>
              <p role="status" className="text-gray-700">{report.gate.reason}</p>
              <Link className={secondaryLinkClass} href={href}>查看访问状态</Link>
            </>}
          </li>;
        })}</ul>}
    </section>
    <section aria-labelledby="pharma-current-authorization" className="min-w-0 space-y-2 border-t border-gray-200 pt-5 text-sm">
      <h3 id="pharma-current-authorization" className="text-base font-semibold">当前汇总授权</h3>
      <p className="font-medium">{allowedMembers.status === 'available'
        ? `当前允许汇总人数：${allowedMembers.value} 人` : allowedMembers.reason}</p>
      <p className="max-w-prose text-gray-700">当前汇总授权人数不等于本版报告的统计分母；各版统计范围以固定报告为准。</p>
      <Link className={secondaryLinkClass} href={`/clinic/projects/${encodeURIComponent(project.id)}/services`}>切换到院内服务演示</Link>
    </section>
  </article>;
}
