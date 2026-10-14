// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PatientProvider, usePatientId } from "@/lib/client/patientContext";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
function Selection() { return createElement("p", {}, usePatientId()); }
const tree = () => createElement(PatientProvider, null, createElement(Selection));
afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState({}, "", "/"); });
it("URL-selected project member overrides saved PA and follows query changes without remount", async () => {
 localStorage.setItem("demo.patientId", "P-A"); window.history.replaceState({}, "", "/patient?patient=P-0040");
 const { rerender } = render(tree()); await waitFor(() => expect(screen.getByText("P-0040")).toBeTruthy()); expect(localStorage.getItem("demo.patientId")).toBe("P-0040");
 window.history.replaceState({}, "", "/patient?patient=P-0042"); rerender(tree()); await waitFor(() => expect(screen.getByText("P-0042")).toBeTruthy()); expect(localStorage.getItem("demo.patientId")).toBe("P-0042");
});
it("keeps existing saved patient behavior when no URL selection is present", async () => {
 localStorage.setItem("demo.patientId", "P-B"); render(tree()); await waitFor(() => expect(screen.getByText("P-B")).toBeTruthy());
});
