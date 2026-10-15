import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { bundle } from './build.mjs';
import { Runtime } from './runtime.mjs';
import { prepare, assertDTO, project } from './operations.mjs';

// Capture genuine DTOs and the independently decoded SQLite state; no view factory
// or fabricated DTO fixture is used as the positive oracle.
const directory = resolve(process.env.WORKER_STATE_ARTIFACT_DIR || `.wrangler/task12-a-dto-${Date.now()}`);
await mkdir(directory, { recursive: true });
console.log(`DTO regression artifacts: ${directory}`);
const runtime = new Runtime(directory), fixtures = {};
try {
  await runtime.start(await bundle(directory));
  for (const kind of ['pro', 'interaction', 'delivery']) {
    const operation = await prepare(runtime, kind, `dto-regression-${kind}`);
    const before = { dto: await runtime.ok(operation.get), saved: (await runtime.inspect()).saved, operation };
    const receipt = await runtime.ok(operation.path, operation.body);
    fixtures[kind] = { dto: await runtime.ok(operation.get), saved: (await runtime.inspect()).saved, operation, receipt, before };
  }
  await writeFile(join(directory, 'captured-dtos.json'), JSON.stringify(fixtures, null, 2));
} finally { await runtime.stop(); }

for (const kind of ['pro', 'interaction', 'delivery']) test(`${kind}: genuine before/after DTOs agree with saved state`, () => {
  const fixture = fixtures[kind];
  assertDTO(kind, fixture.before.dto, fixture.before.saved, fixture.operation);
  assertDTO(kind, fixture.dto, fixture.saved, fixture.operation);
});

function rejects(kind, label, mutate) {
  test(`${kind}: rejects ${label}`, () => {
    const { dto, saved, operation, receipt } = fixtures[kind], changed = structuredClone(dto);
    mutate(changed, receipt);
    assert.throws(() => assertDTO(kind, changed, saved, operation), assert.AssertionError);
  });
}
for (const kind of ['pro', 'interaction']) {
  const assignments = dto => kind === 'pro' ? dto.projects[0].assignments : dto.assignments;
  rejects(kind, 'empty assignments', dto => assignments(dto).splice(0));
  rejects(kind, 'missing affected assignment', dto => {
    const id = `${project}:ENR-01:${kind === 'pro' ? 'PRO' : 'CONTACT'}:2026-10`;
    const list = assignments(dto); list.splice(list.findIndex(a => a.id === id), 1);
  });
  rejects(kind, 'duplicate assignment', dto => assignments(dto).push(structuredClone(assignments(dto)[0])));
  rejects(kind, 'wrong patient scope', dto => { dto.patientId = 'P-B'; });
  rejects(kind, 'wrong enrollment scope', dto => { (kind === 'pro' ? dto.projects[0] : dto).enrollment.id = 'ENR-02'; });
  rejects(kind, 'wrong project scope', dto => { (kind === 'pro' ? dto.projects[0] : dto).project.id = 'another-project'; });
  rejects(kind, 'wrong seed', dto => { dto.seedVersion++; });
}
rejects('pro', 'missing patient project', dto => { dto.projects = []; });
rejects('interaction', 'empty alerts', dto => { dto.alerts = []; });
rejects('interaction', 'missing alert', dto => { dto.alerts.pop(); });
rejects('interaction', 'empty contacts', dto => { dto.contacts = []; });
rejects('interaction', 'missing actual committed contact', (dto, receipt) => { dto.contacts = dto.contacts.filter(c => c.interactionId !== receipt.data.interactionId); });
for (const field of ['interactionId', 'enrollmentId', 'assignmentId', 'channel', 'outcome', 'occurredAt', 'recordedAt', 'actorId', 'background']) {
  rejects('interaction', `tampered contact ${field}`, (dto, receipt) => {
    const contact = dto.contacts.find(c => c.interactionId === receipt.data.interactionId);
    contact[field] = field === 'background' ? !contact[field] : 'tampered';
  });
}
rejects('interaction', 'tampered contact alert links', (dto, receipt) => { dto.contacts.find(c => c.interactionId === receipt.data.interactionId).alertIds = []; });
rejects('delivery', 'different report identity', dto => { dto.report.id = 'other-report'; });
