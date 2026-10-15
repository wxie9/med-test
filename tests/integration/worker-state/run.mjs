/** Run after npm run build:worker. All storage and code variants remain in an isolated artifact directory. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { bundle, workerName } from './build.mjs';
import { Runtime } from './runtime.mjs';
import { prepare, assertEffects, assertDTO, patientPath } from './operations.mjs';
const modes = ['handler-throw', 'handler-500', 'gzip-throw', 'capacity', 'before-put', 'after-put', 'uncertain-old', 'uncertain-new', 'response-loss'];
const directory = resolve(process.env.WORKER_STATE_ARTIFACT_DIR || `.wrangler/task12-a-${Date.now()}`);
await mkdir(directory, { recursive: true });
const records = [], started = performance.now();
const same = (actual, expected, label) => assert.ok(isDeepStrictEqual(actual, expected), label);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const counts = s => ({ snapshots: s.psp.snapshots?.length ?? 0, reports: s.psp.reportVersions?.length ?? 0, artifacts: s.psp.deliveryArtifacts?.length ?? 0, receipts: s.psp.commandReceipts.length });
const runtime = new Runtime(directory);
async function checkedGET(kind, operation, saved) {
  const dto = await runtime.ok(operation.get);
  assertDTO(kind, dto, saved, operation);
  return dto;
}
console.log(`Artifacts: ${directory}`);
let original;
try {
  original = await bundle(directory);
  await runtime.start(original);
  await runtime.ok(patientPath);
  const initial = (await runtime.inspect()).saved;
  const schema = await runtime.sql('SELECT name, sql FROM sqlite_master');
  assert.ok(schema.some(row => row.name === '_cf_KV'));
  await writeFile(join(directory, 'sqlite-schema.json'), JSON.stringify(schema, null, 2));
  console.log('Real OpenNext / DemoState / SQLite smoke PASS');
  for (const kind of ['pro', 'interaction', 'delivery']) for (const mode of modes) {
    const start = performance.now();
    const operation = await prepare(runtime, kind, `task12-${kind}-${mode}`);
    const beforeDTO = await runtime.ok(operation.get);
    const before = (await runtime.inspect()).saved;
    assertDTO(kind, beforeDTO, before, operation);
    const first = await runtime.request(operation.path, operation.body, mode);
    assert.equal(first.status, mode === 'handler-500' ? 500 : 503);
    assert.equal(first.cache, 'no-store');
    const observed = await runtime.inspect(), trace = structuredClone(observed.trace);
    assert.equal(trace.handles, 1, 'real command must run before fault');
    assert.ok(trace.receipt.objectVersion, 'real command receipt captured');
    assertEffects(kind, before, trace.candidate, trace.receipt);
    const committed = ['after-put', 'uncertain-new', 'response-loss'].includes(mode);
    const expected = committed ? trace.candidate : before;
    same(observed.saved, expected, `${kind}/${mode}: complete authoritative store at commit boundary`);
    if (mode === 'capacity') { assert.ok(trace.encodedBytes > 2096128); assert.equal(trace.putAttempts, 0); }
    if (mode === 'gzip-throw') { assert.equal(trace.gzipReached, 1); assert.equal(trace.putAttempts, 0); }
    assert.equal(trace.puts, committed ? 1 : 0);
    if (mode.startsWith('uncertain-')) {
      assert.equal(observed.memoryUndefined, true);
      const blocked = await runtime.request(operation.get);
      assert.equal(blocked.status, 503); assert.equal(blocked.cache, 'no-store');
      const blockedState = await runtime.inspect();
      assert.equal(blockedState.trace.handles, 1, 'blocked read cannot execute handler');
      assert.equal(blockedState.memoryUndefined, true);
      same(blockedState.saved, expected, 'failed read cannot change saved state');
    }
    const recoveredDTO = await checkedGET(kind, operation, expected);
    if (!committed) same(recoveredDTO, beforeDTO, 'GET reflects old state');
    same((await runtime.inspect()).saved, expected, 'subsequent GET preserves full authoritative state');
    await runtime.evict();
    same(await checkedGET(kind, operation, expected), recoveredDTO, 'real DO eviction / constructor GET');
    same((await runtime.inspect()).saved, expected, 'after eviction full authoritative state');
    // Entire workerd shutdown/restart also proves the result is not held in a JS global.
    await runtime.restart();
    same(await checkedGET(kind, operation, expected), recoveredDTO, 'whole runtime restart GET');
    same((await runtime.inspect()).saved, expected, 'after process restart full authoritative state');
    const retry = await runtime.ok(operation.path, operation.body);
    if (committed) same(retry, trace.receipt, 'exact hidden original success receipt after restart');
    const saved = await runtime.inspect();
    assertEffects(kind, before, saved.saved, retry);
    if (committed) same(saved.saved, expected, 'retry has no changes at all');
    await checkedGET(kind, operation, saved.saved);
    same(await runtime.ok(operation.path, operation.body), retry, 'second exact serialized-body replay');
    await checkedGET(kind, operation, saved.saved);
    same((await runtime.inspect()).saved, saved.saved, 'second replay has zero duplicate/partial effects');
    const record = { kind, mode, status: first.status, committed, puts: trace.puts, putAttempts: trace.putAttempts, gzipReached: trace.gzipReached, encodedBytes: trace.encodedBytes, rawGzipBytes: saved.bytes, ...counts(saved.saved), beforeDigest: digest(before), afterDigest: digest(saved.saved), dtoAgreement: ['before', 'recovered', 'eviction', 'restart', 'retry', 'second-retry'], eviction: 'PASS', restart: 'PASS', milliseconds: Math.round(performance.now() - start) };
    records.push(record); console.log(JSON.stringify(record));
    await writeFile(join(directory, 'results.json'), JSON.stringify(records, null, 2));
  }
  // Keep the distinctive final delivered report plus all its signatures/snapshot and receipt.
  const seedPro = await prepare(runtime, 'pro', 'task12-seed-pro');
  await runtime.ok(seedPro.path, seedPro.body);
  const seedInteraction = await prepare(runtime, 'interaction', 'task12-seed-interaction', false);
  await runtime.ok(seedInteraction.path, seedInteraction.body);
  const seedOperation = await prepare(runtime, 'delivery', 'task12-seed-delivery', false);
  const receipt = await runtime.ok(seedOperation.path, seedOperation.body);
  const baseline = await runtime.inspect();
  const seedViews = [['pro', seedPro], ['interaction', seedInteraction], ['delivery', seedOperation]];
  for (const [kind, operation] of seedViews) await checkedGET(kind, operation, baseline.saved);
  const docs = await bundle(directory, 'docs');
  assert.equal(docs.fingerprint, original.fingerprint);
  await runtime.restart(docs);
  for (const [kind, operation] of seedViews) await checkedGET(kind, operation, baseline.saved);
  same((await runtime.inspect()).saved, baseline.saved, 'docs-only bundle preserves all saved state');
  same(await runtime.ok(seedOperation.path, seedOperation.body), receipt, 'docs-only receipt replay');
  for (const [kind, operation] of seedViews) await checkedGET(kind, operation, baseline.saved);
  const psp = await bundle(directory, 'psp');
  assert.notEqual(psp.fingerprint, original.fingerprint);
  await runtime.restart(psp);
  await runtime.ok(patientPath);
  const fresh = await runtime.inspect();
  await checkedGET('pro', seedPro, fresh.saved);
  assert.equal(fresh.saved.seedVersion, 1);
  same(fresh.saved, initial, 'PSP-only byte change restores exact full original initial state');
  assert.deepEqual(counts(fresh.saved), { snapshots: 0, reports: 0, artifacts: 0, receipts: 0 });
  // workerd intentionally denies SQL access to internal KV tables. Inspect the
  // stopped SQLite file read-only on the host, without decoding V8 value blobs.
  await runtime.stop();
  const keys = JSON.parse(execFileSync('python3', ['-c', `
import json, pathlib, sqlite3, sys
rows = []
for path in pathlib.Path(sys.argv[1]).rglob('*.sqlite'):
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    if db.execute("SELECT 1 FROM sqlite_master WHERE name='_cf_KV'").fetchone():
        rows.extend({'file': str(path), 'key': key} for (key,) in db.execute('SELECT key FROM _cf_KV ORDER BY key'))
    db.close()
print(json.dumps(rows))
`, join(directory, 'sqlite')], { encoding: 'utf8' }));
  assert.ok(keys.some(row => row.key === original.key));
  assert.ok(keys.some(row => row.key === psp.key));
  await runtime.restart(original);
  for (const [kind, operation] of seedViews) await checkedGET(kind, operation, baseline.saved);
  same((await runtime.inspect()).saved, baseline.saved, 'restoring original bundle restores original namespace');
  same(await runtime.ok(seedOperation.path, seedOperation.body), receipt, 'original namespace exact receipt');
  for (const [kind, operation] of seedViews) await checkedGET(kind, operation, baseline.saved);
  records.push({ kind: 'seed-invalidation', modes: ['docs-preserves', 'psp-whitespace-fresh', 'original-restores'], originalKey: original.key, changedKey: psp.key, keys, rawGzipBytes: baseline.bytes, ...counts(baseline.saved), status: 'PASS' });
  // The test bundles must never overwrite deployment artifacts or production source.
  for (const [path, hash] of Object.entries(original.hashes)) assert.equal(createHash('sha256').update(await readFile(resolve(path))).digest('hex'), hash, `${path} untouched`);
  console.log(`PASS: ${records.length} integration cases (${modes.length * 3} fault operations + seed lifecycle), ${Math.round(performance.now() - started)} ms`);
} catch (error) {
  console.error(error);
  await writeFile(join(directory, 'failure.txt'), String(error.stack ?? error));
  process.exitCode = 1;
} finally {
  await runtime.stop();
  await writeFile(join(directory, 'results.json'), JSON.stringify({ workerName, className: 'DemoState', objectName: 'shared-investor-demo', durationMs: Math.round(performance.now() - started), passed: records.length, records }, null, 2));
}
