"use client";
import { usePathname } from "next/navigation";
import { useDemoState, useResearchState } from "@/lib/client/useDemoState";
import type { AgentMode } from "@/lib/state/store";

export const MODE_LABELS: Record<AgentMode, string> = { deterministic: "本地演示模式", claude: "Claude", openai: "兼容模型" };
type ModeData = { agentMode: AgentMode };

function ModeLabel({ data }: { data: ModeData | null }) {
  const label = data ? MODE_LABELS[data.agentMode] : "…";
  return (
    <span data-testid="mode-badge" className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700">
      {label}
    </span>
  );
}
function DemoMode() { return <ModeLabel data={useDemoState<ModeData>(30000).data} />; }
function ResearchMode() { return <ModeLabel data={useResearchState<ModeData>(30000).data} />; }
/** On research-portal pages the badge polls the research-scoped state, so pharma pages never fetch clinic data. */
export function ModeBadge() {
  const pathname = usePathname() ?? "/";
  return pathname === "/research" || pathname.startsWith("/research/") ? <ResearchMode /> : <DemoMode />;
}
