import { DurableObject } from "cloudflare:workers";
import handler from "../.open-next/worker.js";
import files, { seedFingerprint } from "./files.generated.mjs";
import { createDurableRequest } from "../lib/state/durableRequest.ts";
import { encodeDemoStore, decodeDemoStore } from "../lib/state/persistence.ts";

globalThis.__demoFiles = files;
const manifest = JSON.parse(files["data/seed/manifest.json"]);
const stateKey = `demo-v2-${manifest.version}-${seedFingerprint}`;

/** One globally addressed coordinator preserves the existing shared demo semantics. */
export class DemoState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.runDurableRequest = createDurableRequest({
      read: () => ctx.storage.get(stateKey),
      write: saved => ctx.storage.put(stateKey, saved),
      getState: () => globalThis.__demoStore,
      setState: state => { globalThis.__demoStore = state; },
      encode: encodeDemoStore,
      decode: decodeDemoStore,
      handle: request => handler.fetch(request, this.env, {
        waitUntil: promise => ctx.waitUntil(promise), passThroughOnException() {},
      }),
    });
  }

  async fetch(request) {
    // GET /api/state can also escalate alerts: every stateful request is persisted.
    return this.ctx.blockConcurrencyWhile(() => this.runDurableRequest(request));
  }
}

const worker = {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      const id = env.DEMO_STATE.idFromName("shared-investor-demo");
      return env.DEMO_STATE.get(id).fetch(request);
    }
    return handler.fetch(request, env, ctx);
  },
};
export default worker;
export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";
