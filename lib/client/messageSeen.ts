"use client";
const key = (patientId: string) => `demo.lastSeenMsg.${patientId}`;
/** ISO time of the newest message the patient has viewed ("" if never). localStorage failures are ignored. */
export function getLastSeen(patientId: string): string { try { return localStorage.getItem(key(patientId)) ?? ""; } catch { return ""; } }
export function markSeen(patientId: string, at: string) { try { localStorage.setItem(key(patientId), at); } catch { /* storage unavailable */ } }
