/** Fixed, non-interactive repeated watermark over every research page. */
const TEXT = "合成数据，仅用于演示";
export function Watermark() {
  return (
    <div aria-hidden="true" data-testid="watermark" className="pointer-events-none fixed inset-0 z-50 select-none overflow-hidden">
      <div className="absolute -inset-1/4 grid -rotate-[24deg] grid-cols-6 content-start gap-x-16 gap-y-24">
        {Array.from({ length: 96 }, (_, i) => <span key={i} className="whitespace-nowrap text-lg font-semibold text-gray-400/20">{TEXT}</span>)}
      </div>
    </div>
  );
}
