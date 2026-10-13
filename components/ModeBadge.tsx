"use client";
import { useDemoState } from "@/lib/client/useDemoState";
import type { AgentMode } from "@/lib/state/store";

const LABELS: Record<AgentMode, string> = { deterministic: "本地演示模式", claude: "Claude", openai: "兼容模型" };

export function ModeBadge() {
  const { data } = useDemoState<{ agentMode: AgentMode }>(30000);
  const label = data ? LABELS[data.agentMode] : "…";
  return (
    <span data-testid="mode-badge" className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700">
      {label}
    </span>
  );
}
