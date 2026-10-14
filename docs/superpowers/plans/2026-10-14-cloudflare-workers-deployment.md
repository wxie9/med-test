# Cloudflare Workers deployment plan

**Goal:** publish and verify the existing synthetic-data demo on Workers Free.
**Architecture:** Next.js + OpenNext, bundled runtime files, connected Git builds.
**Constraints:** worker med-test; retain local npm run demo; fixed time 2026-10-13T10:00:00+08:00; no secrets, paid upgrades, or real patient data.

- [x] Add a regression that loads the seed with filesystem access unavailable; watch it fail.
- [x] Add lib/runtime/files.ts and use it in lib/seed/load.ts and app/demo-script/page.tsx. Add scripts/build-worker-files.ts to generate a Worker runtime file module containing the four seed JSONs and demo script.
- [x] Add OpenNext/Wrangler configuration, cloudflare/worker.mjs, cached static asset headers, and build:worker/preview:worker/deploy:worker scripts. Ignore generated artifacts and local credentials.
- [x] Run the regression, npm test, npm run lint, npx tsc --noEmit, npm run build:worker. Preview via npx wrangler dev and validate the multi-step story. Resolve demonstrated runtime/Free-plan blockers.
- [x] Document commands and state limits, commit and push the authorized deployment changes to main.
- [x] Set connected Cloudflare build to npm run build:worker and deploy to npx wrangler deploy, then verify the resulting Workers URL and reset the demo to seed state.


## Validation evidence

- 2026-10-14: 363 unit tests, lint and TypeScript passed before publishing the Durable Object fix; subsequent seed-fingerprint regression covers anchor-only updates.
- OpenNext build and local Wrangler dry-run succeeded, compressed Worker approximately 1.7 MiB.
- Local Workers runtime: full story, three reset rounds and viewport checks passed. Restart restored the same two alert IDs and seedVersion from SQLite storage.
- Cloudflare Git build of 7e4f447 succeeded. Public full story and viewport checks passed; three reset rounds passed on a separate rerun after rollout propagation. Initial propagation mixed old/new behavior, so final release checks wait for deployment to settle.
- Code review found anchor-only updates would not invalidate the cohort-checksum storage key. Packaging now computes SHA-256 over all seed inputs; it excludes documentation-only changes.
