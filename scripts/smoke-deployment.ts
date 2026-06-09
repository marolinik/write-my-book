type SmokeEndpoint = {
  path: string;
  expectOk: boolean;
};

const baseUrl = (process.env.SMOKE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoints: SmokeEndpoint[] = [
  { path: "/api/health", expectOk: true },
  { path: "/api/health/dependencies", expectOk: true },
];
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "10000");

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  let failed = false;
  for (const endpoint of endpoints) {
    const url = `${baseUrl}${endpoint.path}`;
    const started = Date.now();
    try {
      const response = await fetchWithTimeout(url);
      const latencyMs = Date.now() - started;
      const body = await response.text();
      const ok = response.ok === endpoint.expectOk;
      console.log(`${ok ? "✅" : "❌"} ${endpoint.path} status=${response.status} latency=${latencyMs}ms`);
      if (!ok) {
        failed = true;
        console.log(body.slice(0, 1200));
      }
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : "request failed";
      console.log(`❌ ${endpoint.path} ${message}`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
