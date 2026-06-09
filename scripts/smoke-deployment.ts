import "dotenv/config";

const baseUrl = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoints = ["/api/health", "/api/health/dependencies"];

async function check(endpoint: string) {
  const url = `${baseUrl}${endpoint}`;
  const started = Date.now();
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  const latencyMs = Date.now() - started;
  console.log(`${response.ok ? "OK" : "FAIL"} ${response.status} ${endpoint} ${latencyMs}ms`);
  if (!response.ok) {
    console.error(JSON.stringify(body, null, 2));
    process.exitCode = 1;
  }
}

for (const endpoint of endpoints) {
  await check(endpoint);
}
