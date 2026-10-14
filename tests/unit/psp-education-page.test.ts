// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useParams: () => ({ assignmentId: 'PSP-BC-ENDO-001%3AENR-01%3AEDUCATION%3A2026-10' }) }));
vi.mock('@/lib/client/patientContext', () => ({ usePatientId: () => 'P-A' }));
import PatientEducationPage from '@/app/patient/education/[assignmentId]/page';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('decodes the dynamic browser segment once before constructing the education API URL', async () => {
 const fetcher = vi.fn<(url: string) => Promise<Response>>(() => Promise.resolve(new Response('{}', { status: 404 }))); vi.stubGlobal('fetch', fetcher); render(createElement(PatientEducationPage));
 await waitFor(() => expect(fetcher).toHaveBeenCalled()); expect(fetcher.mock.calls[0][0]).toBe('/api/psp/education/PSP-BC-ENDO-001%3AENR-01%3AEDUCATION%3A2026-10?role=patient&actorId=P-A');
});
