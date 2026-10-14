// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Plans } from '@/components/psp/Common';
import type { AssignmentSummary } from '@/lib/psp/views';
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement('a', props, children) }));
afterEach(cleanup);
const assignment: AssignmentSummary = { id: 'PSP:ENR:PRO:2026-10', kind: 'questionnaire', title: '项目症状问卷', assignedAt: '2026-10-01T00:00:00Z', dueAt: '2026-10-13T01:00:00Z', status: 'open', version: 1, firstValidSubmittedAt: null, latestValidResponseId: null, actionable: true };
it('links active patient questionnaires to their fixed assignment without enabling internal desk links', () => {
 const { rerender } = render(createElement(Plans, { assignments: [assignment], patientId: 'P-A', canSubmit: true } as Parameters<typeof Plans>[0]));
 expect(screen.getByRole('link', { name: '填写项目问卷' }).getAttribute('href')).toBe('/patient/pro?assignment=PSP%3AENR%3APRO%3A2026-10&patient=P-A');
 rerender(createElement(Plans, { assignments: [assignment] })); expect(screen.queryByRole('link')).toBeNull();
});
it('shows real late completion and offers explicit revision only with active service permission', () => {
 const completed = { ...assignment, status: 'completed' as const, actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1' };
 const { rerender } = render(createElement(Plans, { assignments: [completed], patientId: 'P-A', canSubmit: true } as Parameters<typeof Plans>[0]));
 expect(screen.getByText(/已完成 · 迟交/)).toBeTruthy(); expect(screen.getByRole('link', { name: '修订项目问卷' }).getAttribute('href')).toContain('revisionOf=PRO-1');
 rerender(createElement(Plans, { assignments: [completed], patientId: 'P-A', canSubmit: false } as Parameters<typeof Plans>[0])); expect(screen.queryByRole('link')).toBeNull();
});
it('keeps unauthorized questionnaires and contact/education plans read-only', () => {
 render(createElement(Plans, { assignments: [{ ...assignment, actionable: false }, { ...assignment, id: 'contact', kind: 'contact' }, { ...assignment, id: 'education', kind: 'education' }], patientId: 'P-A', canSubmit: false } as Parameters<typeof Plans>[0]));
 expect(screen.queryByRole('link')).toBeNull();
});
it('removes the obsolete questionnaire later-stage label once Task 3 is open', () => {
 render(createElement(Plans, { assignments: [{ ...assignment, title: '项目月度问卷（后续阶段开放）' }], patientId: 'P-A', canSubmit: true }));
 expect(screen.getByText('项目月度问卷')).toBeTruthy(); expect(screen.queryByText(/后续阶段开放/)).toBeNull();
});
