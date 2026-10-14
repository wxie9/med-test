# Cloudflare Workers deployment design

Authorized scope: publish the existing med-test investor demo to the user's Cloudflare Workers account, using its connected GitHub main branch and the Free plan.

Use OpenNext to preserve Next.js 15 and its API routes. A custom Worker entry embeds only the synthetic seed JSON and the public demo-script Markdown into a runtime file map; Node development keeps its filesystem fallback. Build generates the deterministic gen-v4 cohort before compiling. No model keys are bundled or uploaded; deterministic assistants and a fixed Shanghai demo clock are the default.

The existing in-memory store is volatile and globally shared among requests handled by the same isolate. Workers may use multiple isolates, so state continuity must be tested. If the ordinary Worker does not preserve the multi-step story, route dynamic requests through a single Durable Object and preserve state there; do not claim persistence or multi-user isolation without evidence.

Alternatives: static export cannot preserve the API; migrating frameworks adds unnecessary behavior changes. OpenNext is the initial path, subject to Free-plan size and CPU limits. No paid plan or R2 billing activation is authorized.

Validation: filesystem-free seed loading regression, existing unit suite, lint, types, Next/OpenNext build, local Workers runtime page/API/story checks, and the published URL. Cloudflare Git build commands must match the repository scripts. Deliver the live URL, reproducible deployment instructions and any verified state limitations.

Public validation found a 503 on repeated reset and missing research snapshots across requests. Route all API requests through DemoState, a SQLite-backed Durable Object addressed by one global name. Persist gzip-encoded store state before responding and restore it on activation. Frontend rendering stays on the ordinary Worker. Key snapshots by seed version/checksum; retain shared-demo/reset semantics and do not enable billing.

Use a build-time SHA-256 fingerprint covering anchors, cohort, edge cases and manifest for storage invalidation. The existing cohort checksum remains unchanged for clinical-demo contracts. Prefix the persistence key with schema v1.
