export function PharmaDeliveryChecklist(){
 return <section data-testid="psp-pharma-delivery-checklist" aria-labelledby="public-delivery-check-heading" className="min-w-0 space-y-3 border-t border-gray-200 pt-4">
  <h2 id="public-delivery-check-heading" className="font-semibold">交付核对提示</h2>
  <p className="max-w-prose text-sm text-gray-700">按以下依据核对本次交付，核对提示仅提供阅读导航。</p>
  <ul className="space-y-2 text-sm">
   <li><a className="text-pink-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-pink-700" href="#public-report-body">范围与阶段</a><p className="text-gray-700">本版范围、统计窗口与阶段截止。</p></li>
   <li><a className="text-pink-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-pink-700" href="#public-report-timeline">本版签署与固定文件</a><p className="text-gray-700">数据与医学签署、交付时间、固定文本和 HTML。</p></li>
   <li><a className="text-pink-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-pink-700" href="#public-report-next-actions">服务记录限制及下一期安排</a><p className="text-gray-700">结合提要中的保护、未知和无适用说明阅读本版安排。</p></li>
  </ul>
 </section>;
}
