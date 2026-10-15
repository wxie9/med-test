/** TEST BUILD ONLY. The esbuild resolver replaces one import from cloudflare/worker.mjs. */
import { createDurableRequest as production, type DurableRequestDependencies } from '../../../lib/state/durableRequest';
import type { DemoStore } from '../../../lib/state/store';

const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, v) => v instanceof Map ? [...v.values()] : v));
function padding() {
  let seed = 0x12345678;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const pieces: string[] = [];
  for (let block = 0; block < 64; block++) {
    let text = '';
    for (let i = 0; i < 65536; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      text += alphabet[(seed >>> 0) & 63];
    }
    pieces.push(text);
  }
  return pieces.join('');
}
export function createDurableRequest(deps: DurableRequestDependencies<DemoStore, [Request]>) {
  let mode = '', readFailures = 0;
  let trace = { mode: '', reads: 0, handles: 0, puts: 0, putAttempts: 0, gzipReached: 0, encodedBytes: 0, receipt: null as unknown, candidate: null as unknown };
  const run = production<DemoStore, [Request]>({ ...deps,
    read: async () => {
      trace.reads++;
      if (readFailures > 0) { readFailures--; throw new Error('test read unavailable'); }
      return deps.read();
    },
    handle: async request => {
      trace.handles++;
      const response = await deps.handle(request);
      if (mode) {
        trace.receipt = await response.clone().json();
        trace.candidate = snapshot(deps.getState());
        if (!response.ok) throw new Error('Expected real command success before injection');
      }
      if (mode === 'handler-throw') throw new Error('test after real handler');
      if (mode === 'handler-500') return Response.json({ error: 'test after real handler' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
      return response;
    },
    encode: async state => {
      const original = globalThis.CompressionStream;
      if (mode === 'capacity') state.patients.get('P-A')!.expertNote = padding();
      if (mode === 'gzip-throw') globalThis.CompressionStream = new Proxy(original, { construct() { trace.gzipReached++; throw new Error('test real gzip constructor'); } });
      try { const encoded = await deps.encode(state); trace.encodedBytes = encoded.byteLength; return encoded; }
      finally { globalThis.CompressionStream = original; }
    },
    write: async encoded => {
      trace.putAttempts++;
      if (mode === 'before-put' || mode === 'uncertain-old') {
        if (mode === 'uncertain-old') readFailures = 2;
        throw new Error('test before actual put');
      }
      await deps.write(encoded); trace.puts++;
      if (mode === 'after-put' || mode === 'uncertain-new') {
        if (mode === 'uncertain-new') readFailures = 2;
        throw new Error('test after actual put');
      }
    },
  });
  return async (request: Request) => {
    // Private instrumentation exists only in the disposable test bundle. This read does
    // not consume injected failures or mutate state; it uses the actual storage closure.
    if (request.headers.get('x-test-inspect') === '1') {
      const bytes = await deps.read();
      return Response.json({ trace, memoryUndefined: deps.getState() === undefined, bytes: bytes?.byteLength ?? 0,
        saved: bytes ? snapshot(await deps.decode(bytes)) : null });
    }
    mode = request.headers.get('x-test-fault') ?? '';
    if (mode) trace = { mode, reads: 0, handles: 0, puts: 0, putAttempts: 0, gzipReached: 0, encodedBytes: 0, receipt: null, candidate: null };
    const response = await run(request);
    mode = '';
    return response;
  };
}
