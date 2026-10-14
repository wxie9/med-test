import handler from "../.open-next/worker.js";
import files from "./files.generated.mjs";

globalThis.__demoFiles = files;
const worker = { fetch: handler.fetch };
export default worker;
export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";
