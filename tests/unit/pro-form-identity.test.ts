// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProForm } from '@/components/patient/ProForm';
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement('a', props, children) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('does not call the prior patient refresh or show a deferred submission after unmount', async () => {
 let resolve!: (response: Response) => void; vi.stubGlobal('fetch', () => new Promise<Response>(r => { resolve = r; }));
 const submitted = vi.fn(); const { unmount } = render(createElement(ProForm, { patientId: 'P-A', scaleId: 'endocrine_monthly_v1', onSubmitted: submitted }));
 fireEvent.click(screen.getByTestId('submit-pro')); unmount();
 await act(async () => { resolve(new Response(JSON.stringify({ feedback: 'old receipt', emergency: false }))); });
 expect(submitted).not.toHaveBeenCalled();
});
