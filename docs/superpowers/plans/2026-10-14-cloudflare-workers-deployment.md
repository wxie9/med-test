# Cloudflare Workers deployment plan

**Goal:** publish and verify the existing synthetic-data demo on Workers Free.
**Architecture:** Next.js + OpenNext, bundled runtime files, connected Git builds.
**Constraints:** worker med-test; retain local npm run demo; fixed time 2026-10-13T10:00:00+08:00; no secrets, paid upgrades, or real patient data.

- [ ] Add a regression that loads the seed with filesystem access unavailable; watch it fail.
- [ ] Add lib/runtime/files.ts and use it in lib/seed/load.ts and app/demo-script/page.tsx. Add scripts/build-worker-files.ts to generate a Worker runtime file module containing the four seed JSONs and demo script.
- [ ] Add OpenNext/Wrangler configuration, cloudflare/worker.mjs, cached static asset headers, and build:worker/preview:worker/deploy:worker scripts. Ignore generated artifacts and local credentials.
- [ ] Run the regression, npm test, npm run lint, npx tsc --noEmit, npm run build:worker. Preview via npx wrangler dev and validate the multi-step story. Resolve demonstrated runtime/Free-plan blockers.
- [ ] Document commands and state limits, commit and push the authorized deployment changes to main.
- [ ] Set connected Cloudflare build to npm run build:worker and deploy to npx wrangler deploy, then verify the resulting Workers URL and reset the demo to seed state.
