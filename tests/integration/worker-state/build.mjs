import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import fingerprintModule from '../../../scripts/seed-fingerprint.ts';
const { fingerprintSeed } = fingerprintModule;
export const root = process.cwd();
export const workerName = 'task12-durable-integration';
export async function bundle(directory, variant = 'original') {
  const source = await readFile(resolve(root, 'cloudflare/files.generated.mjs'), 'utf8');
  const files = JSON.parse(source.slice(source.indexOf('export default ') + 15).trim().replace(/;$/, ''));
  if (variant === 'docs') files['docs/demo-script.md'] += '\nTEST documentation-only variant\n';
  if (variant === 'psp') files['data/seed/psp.json'] += '\n ';
  const fingerprint = fingerprintSeed(files);
  const file = join(directory, `${variant}.mjs`);
  await build({ stdin: { contents: `import worker from ${JSON.stringify(resolve(root, 'cloudflare/worker.mjs'))}; export * from ${JSON.stringify(resolve(root, 'cloudflare/worker.mjs'))}; export default { async fetch(request,env,ctx) { const response = await worker.fetch(request,env,ctx); if(request.headers.get('x-test-fault')==='response-loss') { await response.arrayBuffer(); return Response.json({error:'test response lost after commit'}, {status:503,headers:{'Cache-Control':'no-store'}}); } return response; } };`, resolveDir: root },
    outfile: file, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', conditions: ['workerd','worker','browser'], external: ['node:*','cloudflare:*'], logLevel: 'warning',
    banner: { js: 'import { createRequire as __testCreateRequire } from "node:module"; const require = __testCreateRequire("/worker.js");' },
    plugins: [{ name: 'isolated-fault-dependency', setup(b) {
      b.onResolve({ filter: /^[a-z_]+$/ }, args => builtinModules.includes(args.path) ? { path: 'node:' + args.path, external: true } : undefined);
      b.onResolve({ filter: /durableRequest\.ts$/ }, args => args.importer === resolve(root, 'cloudflare/worker.mjs') ? { path: resolve(root, 'tests/integration/worker-state/fault-shim.ts') } : undefined);
      b.onLoad({ filter: /cloudflare\/files\.generated\.mjs$/ }, () => ({ contents: `export const seedFingerprint=${JSON.stringify(fingerprint)}; export default ${JSON.stringify(files)};`, loader: 'js' }));
    } }],
  });
  const hashes = {};
  for (const path of ['cloudflare/worker.mjs','lib/state/durableRequest.ts','lib/state/persistence.ts','.open-next/worker.js','.open-next/server-functions/default/handler.mjs','cloudflare/files.generated.mjs']) hashes[path] = createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
  const metadata = { variant, file, fingerprint, key: `demo-v2-${JSON.parse(files['data/seed/manifest.json']).version}-${fingerprint}`, hashes };
  await writeFile(join(directory, `${variant}-build.json`), JSON.stringify(metadata, null, 2));
  return metadata;
}
