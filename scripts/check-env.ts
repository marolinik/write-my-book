import "dotenv/config";
import { assertEnvReady } from "../src/lib/env";

const target = (process.argv[2] ?? "web") as "web" | "worker" | "ci";
const result = assertEnvReady(target);
console.log(`Environment OK for ${target} (NODE_ENV=${result.nodeEnv}, CI=${result.ci})`);
