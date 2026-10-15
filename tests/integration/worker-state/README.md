# Real Worker persistence integration

Run from the repository root after the safe Worker build:

```sh
npm run build:worker
npm run test:worker-state
```

The driver owns local ports **8798 / 9241**. It never contacts a deployed Worker and never loads dotenv files. `WORKER_STATE_ARTIFACT_DIR` optionally chooses the artifact directory; the default is a fresh `.wrangler/task12-a-<timestamp>` directory. Use a fresh directory for a new run because exact initial-state assertions deliberately detect retained state.

The test bundle imports the production `cloudflare/worker.mjs` (including `DemoState`, named-object routing and `blockConcurrencyWhile`) and actual OpenNext middleware/route/command modules. An importer-specific esbuild resolver replaces only the worker's `createDurableRequest` dependency with `fault-shim.ts`. That shim forwards all real dependencies to the original coordinator. It never substitutes the class, storage, codec, routes, commands or configured capacity limit. A test-only header enables faults; a separate inspection header reads through the original SQLite storage closure and production decoder. Neither header exists in production artifacts. The production `.open-next` and generated seed bundle are hash-checked as untouched.

The matrix runs PRO, an interaction linked to two actual PSP alerts, and a fully approved report delivery through nine faults each: handler throw, handler 500, actual gzip constructor failure, actual gzip size over 2,096,128 bytes, before-put failure, after-put rejection, uncertain unsaved/recovery-read-blocked, uncertain saved/recovery-read-blocked, and response lost after genuine commit. Capacity uses deterministic high-entropy padding in a permitted patient field, with the real schema and gzip encoder; rollback must remove it.

Each case checks the entire decoded saved store at the failure boundary and after GET, real object eviction, and complete workerd shutdown/restart. The exact serialized command body is then retried twice. Committed branches must return the exact original hidden success receipt; uncommitted branches commit once. Business-specific assertions verify generated records, alert links, assignment/report versions, immutable content and unrelated state.

The seed lifecycle reuses one SQLite directory and named object, with committed PRO, interaction and delivery. A documentation-only embedded change must keep all state and receipts. A valid PSP JSON whitespace-only change must select a new key and reproduce the complete original initial store. Restoring the original bundle must restore its previous state and receipt; both keys must exist in the actual SQLite table.

Artifacts include per-variant source hashes and fingerprints, observed SQLite schema, persistent SQLite files, and `results.json` with case counts, gzip bytes, put counts, digests and restart results. The runner exits nonzero on any assertion and saves `failure.txt`; final root acceptance must rerun it against the final safe Worker build.
