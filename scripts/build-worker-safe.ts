import { buildWorkerBundle } from "./worker-build-policy";

console.log("Building Workers in an isolated directory without local environment files");
try {
  buildWorkerBundle({ sourceRoot: process.cwd() });
  console.log("Worker artifacts validated: no dotenv files or embedded environment values");
} catch (error) {
  // Child commands emit diagnostics; never dump environment variables or generated env-module contents.
  console.error("Worker build failed; deployment was not run");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
}
