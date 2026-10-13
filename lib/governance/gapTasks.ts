import { getStore } from "@/lib/state/store";
import type { DataGapTask } from "@/lib/domain/types";
export function completeGapTask(id: string): DataGapTask {
  const t = getStore().gapTasks.find(x => x.id === id); if (!t) throw new Error("gap task not found");
  t.status = "done"; return t;
}
