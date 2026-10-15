import assert from 'node:assert/strict';
export const project = 'PSP-BC-ENDO-001';
export const patientPath = '/api/psp/patients/P-A/projects?role=patient&actorId=P-A';
export const servicePath = `/api/psp/projects/${project}/services?patientId=P-A&role=case_manager&actorId=case-manager-chen`;
export const staffQuery = 'role=project_manager&actorId=project-manager-psp';
const manager = { role: 'project_manager', actorId: 'project-manager-psp' };
export const window = { periodStart: '2026-10-01T00:00:00+08:00', periodEnd: '2026-11-01T00:00:00+08:00', cutoffAt: '2026-10-13T10:00:00+08:00' };
export async function prepare(client, kind, id, reset = true) {
  if (reset) await client.ok('/api/reset', {});
  const patient = await client.ok(patientPath);
  const meta = (version, identity = manager, suffix = '') => ({ seedVersion: patient.seedVersion, expectedVersion: version, clientRequestId: id + suffix, ...identity });
  if (kind === 'pro') return { path: `/api/psp/assignments/${project}:ENR-01:PRO:2026-10/pro`, body: JSON.stringify({ patientId: 'P-A', scaleId: 'endocrine_monthly_v1', items: { 关节痛: 3, 潮热: 1, 情绪: 1, 睡眠: 1 }, flags: { stopIntent: true, missedDoses14d: 4 }, meta: meta(1, { role: 'patient', actorId: 'P-A' }) }), get: patientPath };
  if (kind === 'interaction') {
    let service = await client.ok(servicePath);
    if (!service.alerts.length) {
      const pro = await prepare(client, 'pro', id + '-setup-pro', false);
      await client.ok(pro.path, pro.body);
      service = await client.ok(servicePath);
    }
    assert.equal(service.alerts.length, 2, 'interaction has two real linked PSP alerts');
    return { path: `/api/psp/projects/${project}/interactions`, body: JSON.stringify({ enrollmentId: 'ENR-01', assignmentId: `${project}:ENR-01:CONTACT:2026-10`, alertIds: service.alerts.map(a => a.id), channel: 'phone', outcome: 'no_answer', meta: meta(1, { role: 'case_manager', actorId: 'case-manager-chen' }) }), get: servicePath };
  }
  const snapshots = `/api/psp/projects/${project}/snapshots`, reports = `/api/psp/projects/${project}/reports`;
  const list = await client.ok(`${snapshots}?${staffQuery}`);
  const frozen = await client.ok(snapshots, { window, meta: meta(list.ledgerRevision, manager, '-freeze') });
  const reportList = await client.ok(`${reports}?${staffQuery}`);
  let report = (await client.ok(reports, { snapshotId: frozen.data.id, nextActions: [], meta: meta(reportList.ledgerRevision, manager, '-draft') })).data;
  const path = `/api/psp/reports/${encodeURIComponent(report.id)}/actions`;
  for (const [action, identity, suffix] of [
    [{ action: 'submit' }, manager, '-submit'],
    [{ action: 'review', kind: 'data', decision: 'approve' }, { role: 'data_reviewer', actorId: 'data-reviewer-psp' }, '-data'],
    [{ action: 'review', kind: 'medical', decision: 'approve' }, { role: 'medical_reviewer', actorId: 'medical-reviewer-psp' }, '-medical'],
  ]) report = (await client.ok(path, { ...action, meta: meta(report.version, identity, suffix) })).data;
  return { path, body: JSON.stringify({ action: 'deliver', meta: meta(report.version) }), get: `/api/psp/reports/${encodeURIComponent(report.id)}?${staffQuery}&seedVersion=${patient.seedVersion}` };
}
export function assertEffects(kind, before, after, receipt) {
  assert.equal(after.psp.commandReceipts.length, before.psp.commandReceipts.length + 1);
  assert.equal(after.psp.ledgerRevision, before.psp.ledgerRevision + (kind === 'delivery' ? 1 : 2));
  assert.equal(after.psp.authorizationVersion, before.psp.authorizationVersion);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.psp.permissionEvents, before.psp.permissionEvents);
  assert.deepEqual(after.psp.snapshots, before.psp.snapshots);
  if (kind === 'pro') {
    assert.equal(after.patients.find(p => p.id === 'P-A').pro.length, before.patients.find(p => p.id === 'P-A').pro.length + 1);
    assert.equal(after.alerts.length, before.alerts.length + 2);
    assert.equal(after.messages.length, before.messages.length + 1);
    const assignment = after.psp.assignments.find(a => a.id === `${project}:ENR-01:PRO:2026-10`);
    assert.equal(assignment.status, 'completed'); assert.equal(assignment.version, receipt.objectVersion);
    assert.equal(assignment.latestValidResponseId, receipt.data.proId);
    assert.equal(new Set(receipt.data.alertIds).size, 2);
  } else if (kind === 'interaction') {
    assert.equal(after.psp.serviceEvents.length, before.psp.serviceEvents.length + 1);
    const events = after.psp.serviceEvents.slice(before.psp.serviceEvents.length);
    const assignment = after.psp.assignments.find(a => a.id === `${project}:ENR-01:CONTACT:2026-10`);
    assert.equal(assignment.version, receipt.objectVersion);
    assert.equal(assignment.version, before.psp.assignments.find(a => a.id === assignment.id).version + 1);
    assert.equal(events[0].interactionId, receipt.data.interactionId);
    assert.deepEqual(events[0].alertIds, before.psp.questionnaireEvidence.at(-1).alerts.map(a => a.id));
    assert.equal(new Set(events.map(e => e.interactionId)).size, 1);
    assert.deepEqual(after.alerts, before.alerts);
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(after.patients, before.patients);
  } else {
    assert.equal(after.psp.deliveryArtifacts.length, (before.psp.deliveryArtifacts?.length ?? 0) + 1);
    assert.equal(after.psp.reportActions.length, before.psp.reportActions.length + 1);
    assert.equal(after.psp.reportActions.at(-1).action, 'deliver');
    assert.equal(after.psp.reportVersions.length, before.psp.reportVersions.length);
    const report = after.psp.reportVersions.find(r => r.id === receipt.data.id);
    const old = before.psp.reportVersions.find(r => r.id === report.id);
    assert.equal(report.version, old.version + 1);
    assert.equal(report.status, 'delivered');
    assert.equal(report.contentDigest, old.contentDigest);
    assert.equal(report.snapshotDigest, old.snapshotDigest);
    assert.deepEqual(report.content, old.content);
    assert.deepEqual(after.psp.reportActions.slice(0, -1), before.psp.reportActions);
    assert.equal(after.psp.deliveryArtifacts.at(-1).digest, after.psp.reportActions.at(-1).artifactDigest);
    assert.deepEqual(after.patients, before.patients);
    assert.deepEqual(after.alerts, before.alerts);
    assert.deepEqual(after.messages, before.messages);
  }
}

function exactIds(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.deepEqual(actual.map(row => row.id).sort(), expected.map(row => row.id).sort(), `${label}: exact scoped IDs (including multiplicity)`);
}
function fieldsEqual(actual, expected, fields, label) {
  assert.ok(actual && expected, `${label} must exist`);
  for (const field of fields) assert.deepEqual(actual[field], expected[field], `${label}.${field}`);
}
export function assertDTO(kind, dto, saved, operation) {
  const body = JSON.parse(operation.body);
  assert.equal(dto.seedVersion, saved.seedVersion);
  if (kind === 'delivery') {
    const reportId = decodeURIComponent(operation.path.split('/')[4]);
    const report = saved.psp.reportVersions.find(r => r.id === reportId);
    assert.ok(report, 'command report exists in saved state');
    assert.deepEqual(dto.report, report, 'GET returns the actual command report');
    assert.equal(dto.ledgerRevision, saved.psp.ledgerRevision);
    return;
  }
  // The serialized command and GET URL determine scope; DTO contents never
  // determine which saved records are expected. No production view is imported.
  const assignmentId = kind === 'pro' ? decodeURIComponent(operation.path.split('/')[4]) : body.assignmentId;
  const affected = saved.psp.assignments.find(a => a.id === assignmentId);
  assert.ok(affected, 'affected assignment exists in saved state');
  const projectId = kind === 'pro' ? project : decodeURIComponent(operation.path.split('/')[4]);
  const patientId = kind === 'pro' ? body.patientId : new URL(operation.get, 'http://task12.local').searchParams.get('patientId');
  const enrollment = saved.psp.enrollments.find(e => e.id === affected.enrollmentId && e.projectId === projectId && e.patientId === patientId);
  assert.ok(enrollment, 'command project/enrollment/patient agree in saved state');
  if (kind === 'interaction') assert.equal(enrollment.id, body.enrollmentId);
  assert.equal(saved.psp.project.id, projectId);
  assert.ok(saved.patients.some(p => p.id === patientId), 'scoped patient exists');
  assert.equal(dto.patientId, patientId);
  let views;
  if (kind === 'pro') {
    const expectedEnrollments = saved.psp.enrollments.filter(e => e.patientId === patientId);
    assert.ok(expectedEnrollments.length > 0, 'patient has expected project enrollment');
    assert.ok(Array.isArray(dto.projects), 'patient projects must be an array');
    exactIds(dto.projects.map(v => v.enrollment), expectedEnrollments, 'patient project enrollments');
    views = dto.projects;
  } else views = [dto];
  for (const view of views) {
    const storedEnrollment = saved.psp.enrollments.find(e => e.id === view.enrollment.id && e.patientId === patientId && e.projectId === projectId);
    assert.ok(storedEnrollment, 'GET enrollment belongs to requested patient/project');
    assert.deepEqual(view.project, saved.psp.project, 'complete project agreement');
    fieldsEqual(view.enrollment, storedEnrollment, ['id', 'status', 'version', ...(kind === 'pro' ? ['eligibilityConfirmed'] : [])], 'enrollment');
    const expectedAssignments = saved.psp.assignments.filter(a => a.projectId === projectId && a.enrollmentId === storedEnrollment.id);
    assert.ok(expectedAssignments.length > 0, 'scoped assignments are nonempty');
    exactIds(view.assignments, expectedAssignments, 'assignments');
    for (const stored of expectedAssignments) {
      const actual = view.assignments.find(a => a.id === stored.id);
      fieldsEqual(actual, stored, ['id', 'kind', 'title', 'assignedAt', 'dueAt', 'status', 'version', 'latestValidResponseId', 'firstValidSubmittedAt'], `assignment ${stored.id}`);
    }
  }
  const affectedView = views.find(v => v.enrollment.id === enrollment.id);
  assert.ok(affectedView?.assignments.some(a => a.id === assignmentId), 'affected command assignment is explicitly present');
  if (kind !== 'interaction') return;
  // Questionnaire evidence records the concrete project alert IDs independently
  // of the service DTO's production PRO-chain traversal.
  const evidence = (saved.psp.questionnaireEvidence ?? []).filter(e => e.projectId === projectId && e.enrollmentId === enrollment.id);
  const alertIds = [...new Set(evidence.flatMap(e => e.alerts.map(a => a.id)))];
  assert.ok(alertIds.length > 0, 'interaction setup has actual project alert evidence');
  const expectedAlerts = alertIds.map(id => {
    const alert = saved.alerts.find(a => a.id === id && a.patientId === patientId);
    assert.ok(alert, `saved scoped alert ${id} exists`); return alert;
  });
  exactIds(dto.alerts, expectedAlerts, 'project alerts');
  assert.deepEqual([...body.alertIds].sort(), [...alertIds].sort(), 'command links the actual scoped alert evidence');
  for (const stored of expectedAlerts) {
    const actual = dto.alerts.find(a => a.id === stored.id);
    fieldsEqual(actual, stored, ['id', 'status', 'proId', 'kind', 'level', 'rule', 'assignee', 'timestamps'], `alert ${stored.id}`);
    assert.equal(actual.version, stored.version ?? 1);
  }
  const events = saved.psp.serviceEvents.filter(e => e.projectId === projectId && e.enrollmentId === enrollment.id);
  assert.ok(events.length > 0, 'scoped saved contacts are nonempty');
  exactIds(dto.contacts, events, 'service contacts');
  for (const event of events) {
    const actual = dto.contacts.find(c => c.id === event.id);
    fieldsEqual(actual, event, ['id', 'interactionId', 'enrollmentId', 'assignmentId', 'channel', 'outcome', 'alertIds', 'occurredAt', 'recordedAt', 'actorId'], `contact ${event.id}`);
    assert.equal(actual.background, event.channel === undefined, `contact ${event.id}.background`);
  }
  const receipt = saved.psp.commandReceipts.find(r => JSON.parse(r.scopeKey).at(-1) === body.meta.clientRequestId);
  if (receipt) assert.ok(dto.contacts.some(c => c.interactionId === receipt.result.data.interactionId && c.assignmentId === assignmentId), 'actual committed interaction is explicitly present');
}
