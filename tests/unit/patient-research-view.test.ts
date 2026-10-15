// @vitest-environment jsdom
import React, { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchPage from "@/app/patient/research/page";
import { PatientProvider, useSetPatientId } from "@/lib/client/patientContext";
import type { PatientView } from "@/lib/client/usePatient";
import { loadSeed } from "@/lib/seed/load";

// The route normally receives search params from Next's router. Keep the real
// patient provider and request lifecycle so switches exercise their binding.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const opportunity = "张医生认为 XX-ADC-301 可能适合您，请到门诊进一步了解。";
const patient = (id: string, withOpportunity = false): PatientView => ({
  seedVersion: 1,
  patient: loadSeed().anchors.find(p => p.id === id)!, alerts: [], tasks: [], today: "2026-10-14",
  messages: withOpportunity ? [{ id: `${id}-opportunity`, patientId: id, kind: "research_opportunity", text: opportunity, at: "2026-10-14T01:00:00Z" }] : [],
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
};
function Harness() {
  const setPatientId = useSetPatientId();
  return createElement(React.Fragment, null,
    ...["P-A", "P-B", "P-K"].map(id => createElement("button", { key: id, onClick: () => setPatientId(id) }, `切换 ${id}`)),
    createElement(ResearchPage),
  );
}
function renderPage(initialId: string) {
  localStorage.setItem("demo.patientId", initialId);
  return render(createElement(PatientProvider, null, createElement(Harness)));
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("patient research opportunity identity", () => {
  it("identifies the candidate alongside the loaded opportunity", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(patient(url.split("/").at(-1)!, true)))));
    renderPage("P-K");
    await waitFor(() => expect(screen.getByText(opportunity)).toBeTruthy());
    expect(screen.getByText("陈女士")).toBeTruthy();
    expect(screen.getByText("当前患者")).toBeTruthy();
    expect(screen.getByText("P-K", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "预约门诊" }));
    expect(screen.getByRole("status").textContent).toContain("已提交预约申请");
  });

  it("preserves the empty state while identifying the loaded patient", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(patient(url.split("/").at(-1)!)))));
    renderPage("P-A");
    await waitFor(() => expect(screen.getByText("暂无研究机会")).toBeTruthy());
    expect(screen.getByText("王女士")).toBeTruthy();
    expect(screen.getByText("P-A", { exact: true })).toBeTruthy();
  });

  it("uses the explicit patient identifier for candidates without a display alias", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(patient(url.split("/").at(-1)!, true)))));
    renderPage("P-C");
    await waitFor(() => expect(screen.getByText(opportunity)).toBeTruthy());
    expect(screen.getByText("患者 P-C")).toBeTruthy();
    expect(screen.getByText("P-C", { exact: true })).toBeTruthy();
  });

  it("removes the previous identity and message while a switched patient loads", async () => {
    const pendingB = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("P-B") ? pendingB.promise : Promise.resolve(json(patient(url.split("/").at(-1)!, true)))));
    renderPage("P-A");
    await waitFor(() => expect(screen.getByText(opportunity)).toBeTruthy());
    expect(screen.getByText("王女士")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "切换 P-B" }));
    expect(screen.getByText("加载中…")).toBeTruthy();
    expect(screen.queryByText("当前患者")).toBeNull();
    expect(screen.queryByText("王女士")).toBeNull();
    expect(screen.queryByText(opportunity)).toBeNull();
    await act(async () => { pendingB.resolve(json(patient("P-B"))); });
    expect(screen.getByText("李女士")).toBeTruthy();
    expect(screen.getByText("P-B", { exact: true })).toBeTruthy();
    expect(screen.getByText("暂无研究机会")).toBeTruthy();
  });

  it("shows the switched patient's load error without the previous identity", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.endsWith("P-B") ? json({}, 404) : json(patient(url.split("/").at(-1)!, true)))));
    renderPage("P-A");
    await waitFor(() => expect(screen.getByText(opportunity)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "切换 P-B" }));
    await waitFor(() => expect(screen.getByText(/加载失败：.*404/)).toBeTruthy());
    expect(screen.queryByText("当前患者")).toBeNull();
    expect(screen.queryByText("王女士")).toBeNull();
    expect(screen.queryByText(opportunity)).toBeNull();
  });
});
