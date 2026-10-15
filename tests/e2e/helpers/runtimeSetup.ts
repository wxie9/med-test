import { expect, request, type FullConfig } from '@playwright/test';
/** This runs after the owned server starts and before any spec can reset it. */
export default async function runtimeSetup(config: FullConfig) {
  const api = await request.newContext({ baseURL: config.projects[0].use.baseURL });
  try {
    const stateResponse = await api.get('/api/state');
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json();
    expect(state.serverNow).toBe('2026-10-13T02:00:00.000Z');
    expect(state.manifest).toMatchObject({ version: 'gen-v4', checksum: 'cc3217fe1d251f10', cutoff: '2026-10-13' });
    expect(state.patientCount).toBe(2012);
    const projectResponse = await api.get('/api/psp/projects/PSP-BC-ENDO-001?role=project_manager&actorId=project-manager-psp');
    expect(projectResponse.ok()).toBe(true);
    const project = await projectResponse.json();
    expect(project.serverNow).toBe(state.serverNow);
    expect(project.seedVersion).toBe(state.seedVersion);
    expect(Date.parse(project.project.cutoffAt)).toBe(Date.parse(state.serverNow));
  } finally { await api.dispose(); }
}
