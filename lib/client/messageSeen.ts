/** Seen-message tracking per patient: a set of message ids in localStorage (key prefix "demo.seen", cleared by the home reset). */
export const SEEN_PREFIX = "demo.seenMsgs.";
const key = (patientId: string) => `${SEEN_PREFIX}${patientId}`;
/** Ids of messages the patient has viewed (empty when never viewed or storage is unavailable). */
export function getSeen(patientId: string): Set<string> {
  try { const raw = localStorage.getItem(key(patientId)); const ids: unknown = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []); }
  catch { return new Set(); }
}
/** Adds ids to the seen set. localStorage failures are ignored. */
export function markSeen(patientId: string, ids: string[]) {
  try { const s = getSeen(patientId); for (const id of ids) s.add(id); localStorage.setItem(key(patientId), JSON.stringify([...s])); } catch { /* storage unavailable */ }
}
export const unreadCount = (messages: { id: string }[], seen: ReadonlySet<string>) => messages.filter(m => !seen.has(m.id)).length;
/** Demo-state keys kept in localStorage (patient choice, clinic identity, seen messages); the home 一键重置 removes them. */
export const DEMO_STORAGE_KEYS = ["demo.patientId", "demo.clinicIdentity"] as const;
export function clearDemoStorage(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && ((DEMO_STORAGE_KEYS as readonly string[]).includes(k) || k.startsWith("demo.seen"))) keys.push(k); }
  for (const k of keys) storage.removeItem(k);
  return keys;
}
