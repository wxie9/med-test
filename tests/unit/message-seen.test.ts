import { describe, it, expect, beforeEach } from "vitest";
import { getSeen, markSeen, unreadCount, clearDemoStorage } from "@/lib/client/messageSeen";
class MemStorage { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
describe("message seen tracking (ids, not timestamps)", () => {
  let store: MemStorage;
  beforeEach(() => { store = new MemStorage(); (globalThis as unknown as { localStorage: Storage }).localStorage = store as unknown as Storage; });
  it("counts unread by id: a message with an older timestamp than a seen one is still unread", () => {
    const msgs = [{ id: "m1", at: "2026-10-13T10:00:00Z" }, { id: "m2", at: "2026-10-13T09:00:00Z" }];
    markSeen("P-A", ["m1"]);
    expect(unreadCount(msgs, getSeen("P-A"))).toBe(1);
    markSeen("P-A", ["m2"]); expect(unreadCount(msgs, getSeen("P-A"))).toBe(0);
    expect(unreadCount(msgs, getSeen("P-B"))).toBe(2); // per patient
  });
  it("survives corrupt storage", () => { store.setItem("demo.seenMsgs.P-A", "{bad"); expect(getSeen("P-A").size).toBe(0); });
  it("reset clears demo.patientId, demo.clinicIdentity and demo.seen* only", () => {
    store.setItem("demo.patientId", "P-K"); store.setItem("demo.clinicIdentity", "张医生"); markSeen("P-A", ["m1"]); store.setItem("demo.seenOther", "1"); store.setItem("other.key", "x");
    expect(clearDemoStorage(store).sort()).toEqual(["demo.clinicIdentity", "demo.patientId", "demo.seenMsgs.P-A", "demo.seenOther"]);
    expect([...store.m.keys()]).toEqual(["other.key"]);
  });
});
