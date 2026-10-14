import { getStore } from "@/lib/state/store";
import { now } from "@/lib/state/clock";
import {shanghaiCalendarDay} from "@/lib/domain/dates";
import type {DemoStore} from "@/lib/state/store";
import type { Patient } from "@/lib/domain/types";
/** Appends or overwrites today's adherence row (due 1) for the patient. */
export function recordAdherence(input: { patientId: string; taken: 0 | 1; missedReason?: string }) {
  return recordAdherenceInStore(getStore(),input,now());
}
export function recordAdherenceInStore(store:DemoStore,input:{patientId:string;taken:0|1;missedReason?:string},at:string) {
  const p = store.patients.get(input.patientId); if (!p) throw new Error("patient not found");
  const row: Patient["adherence"][number] = { date: shanghaiCalendarDay(at), due: 1, taken: input.taken, missedReason: input.taken === 1 ? null : input.missedReason ?? null };
  const i = p.adherence.findIndex(r => r.date === row.date);
  if (i >= 0) p.adherence[i] = row; else p.adherence.push(row);
  return row;
}
