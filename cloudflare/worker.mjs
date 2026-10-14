import { DurableObject } from "cloudflare:workers";
import handler from "../.open-next/worker.js";
import files from "./files.generated.mjs";
import { encodeDemoStore, decodeDemoStore } from "../lib/state/persistence.ts";

globalThis.__demoFiles = files;
const manifest = JSON.parse(files["data/seed/manifest.json"]);
const stateKey = `demo-${manifest.version}-${manifest.checksum}`;

/** One globally addressed coordinator preserves the existing shared demo semantics. */
export class DemoState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get(stateKey);
      globalThis.__demoStore = saved ? await decodeDemoStore(saved) : undefined;
    });
  }

  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const context = { waitUntil: promise => this.ctx.waitUntil(promise), passThroughOnException() {} };
      const response = await handler.fetch(request, this.env, context);
      // GET /api/state can also escalate alerts, so persist all stateful requests.
      if (response.status < 500 && globalThis.__demoStore) {
        const saved = await encodeDemoStore(globalThis.__demoStore);
        if (saved.byteLength > 2 * 1024 * 1024 - 1024) throw new Error("Demo state is too large; reset the demo");
        await this.ctx.storage.put(stateKey, saved);
      }
      return response;
    });
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
