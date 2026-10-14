/** One required seed inventory shared by the Worker bundle and fingerprint. */
export const SEED_FILES = ['data/seed/anchors.json','data/seed/cohort.json','data/seed/edge-cases.json','data/seed/manifest.json','data/seed/psp.json','data/seed/psp-manifest.json'] as const;
export const WORKER_FILES = [...SEED_FILES, 'docs/demo-script.md'] as const;
