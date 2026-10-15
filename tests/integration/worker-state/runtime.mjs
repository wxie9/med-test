import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { workerName, root } from './build.mjs';
import { patientPath } from './operations.mjs';
export class Runtime {
  constructor(directory) { this.directory = directory; }
  async start(built) {
    this.built = built;
    const options = convertV4MiniflareOptions({
      name: workerName, modules: true, scriptPath: built.file, modulesRoot: dirname(built.file),
      compatibilityDate: '2026-10-14', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
      bindings: { DEMO_FIXED_NOW: '2026-10-13T10:00:00+08:00' },
      durableObjects: { DEMO_STATE: { className: 'DemoState', useSQLite: true } },
      serviceBindings: { WORKER_SELF_REFERENCE: workerName },
      assets: { directory: join(root, '.open-next/assets'), binding: 'ASSETS' },
      resourcePersistencePath: join(this.directory, 'sqlite'),
      host: '127.0.0.1', port: 8798, inspectorHost: '127.0.0.1', inspectorPort: 9241,
      cf: false, telemetry: { enabled: false }, unsafeInspectDurableObjects: true,
    });
    // v5's compatibility converter defaults assets to an assets-only worker.
    // Preserve production assets-first routing, with fallback to the real user worker.
    options.workers[0].config.assets.hasUserWorker = true;
    this.mf = new Miniflare(options);
    await this.mf.ready;
  }
  async stop() { if (this.mf) { await this.mf.dispose(); this.mf = undefined; } }
  async restart(built = this.built) { await this.stop(); await this.start(built); }
  async evict() { await this.mf.unsafeEvictDurableObject(workerName, 'DemoState', { name: 'shared-investor-demo' }); }
  async request(path, body, fault) {
    const response = await this.mf.dispatchFetch(`http://task12.local${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(fault ? { 'x-test-fault': fault } : {}) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }
  async ok(path, body) { const r = await this.request(path, body); assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`); return r.body; }
  async inspect() {
    const response = await this.mf.dispatchFetch(`http://task12.local${patientPath}`, { headers: { 'x-test-inspect': '1' } });
    assert.equal(response.status, 200); return response.json();
  }
  async sql(query) { const storage = await this.mf.unsafeGetDurableObjectStorage(workerName, 'DemoState', { name: 'shared-investor-demo' }); return storage.exec(query); }
}
