import type { CohortFilter } from "@/lib/domain/types";
import type { AgentMode } from "@/lib/state/store";
export type AgentKind = "patient" | "doctor" | "research";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatContext = { patientId?: string; snapshotId?: string; filter?: CohortFilter; page: string };
export type ChatRequest = { agent: AgentKind; messages: ChatMessage[]; context: ChatContext };
export type Citation = { id: string; title: string; version: string };
export type ToolCallRecord = { name: string; args: unknown; result: unknown };
export type ChatResponse = { text: string; mode: AgentMode; degraded?: string; citations: Citation[]; toolCalls: ToolCallRecord[] };
/** What a provider produces before the adapter stamps the mode. */
export type ProviderOutput = Omit<ChatResponse, "mode" | "degraded">;
/** Per-request state shared by a failed provider attempt and its deterministic fallback (one gap task per ask). */
export type SharedToolState = { gapTask?: unknown };
