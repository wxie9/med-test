// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PharmaProjects } from "@/components/psp/PharmaProjects";
import { PatientService } from "@/components/psp/PatientService";
import { ModeBadge } from "@/components/ModeBadge";
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement("a", props, children) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/pharma/projects" }));
const project = { id: "PSP-BC-ENDO-001", title: "内分泌治疗支持项目", sponsor: "药企A", scope: "合成服务范围", population: "合成人群", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z", period: "2026-10", cutoffAt: "2026-10-13T02:00:00Z", contactTargets: { high: 2, medium: 24 } };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("pharma page and mode badge fetch only protected pharma projection and show an honest report empty state", async () => {
 const fetcher = vi.fn((url: string) => Promise.resolve(json(url === "/api/pharma/projects" ? { projects: [], seedVersion: 1, agentMode: "deterministic" } : { project, allowedMembers: { status: "available", value: 14 }, metrics: [], reports: [], seedVersion: 1 })));
 vi.stubGlobal("fetch", fetcher); render(createElement("div", {}, createElement(ModeBadge), createElement(PharmaProjects, { projectId: project.id })));
 await waitFor(() => expect(screen.getByText("当前允许汇总人数：14 人")).toBeTruthy());
 expect(screen.getByText(/暂无报告/)).toBeTruthy(); expect(screen.getByTestId("mode-badge").textContent).toBe("本地演示模式");
 expect(fetcher.mock.calls.every(([url]) => url.startsWith("/api/pharma/projects"))).toBe(true);
 expect(screen.queryByText(/候选名单|当前有效服务/)).toBeNull();
});
it("patient authorization scopes stay independent and project questionnaire has no generic PRO link", async () => {
 const posts: Record<string, unknown>[] = [];
 const fetcher = vi.fn((_url: string, options?: RequestInit) => { if (options?.method === "POST") posts.push(JSON.parse(options.body as string)); return Promise.resolve(json({ seedVersion: 1, serverNow: "2026-10-13T02:00:00Z", patientId: "P-A", displayName: "演示患者甲", projects: [{ project, enrollment: { id: "ENR-01", status: "active", version: 1 }, permissions: { service: true, aggregate: false }, permissionHistory: [], assignments: [{ id: "assignment", kind: "questionnaire", title: "项目症状问卷", dueAt: "2026-10-13T01:00:00Z", status: "open", actionable: true }] }] })); });
 vi.stubGlobal("fetch", fetcher); render(createElement(PatientService, { patientId: "P-A" }));
 await waitFor(() => expect(screen.getByText("接受支持服务：已授权")).toBeTruthy());
 expect(screen.getByText("允许项目汇总：未授权")).toBeTruthy(); expect(screen.getByRole("link", { name: "填写项目问卷" }).getAttribute("href")).toContain("assignment=assignment");
 expect(document.querySelector('a[href="/patient/pro"]')).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "同意授权" }));
 await waitFor(() => expect(posts.length).toBe(1)); expect(posts[0].scope).toBe("aggregate"); expect(posts[0].action).toBe("grant");
});
