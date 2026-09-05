// The compose/CI deploy-smoke workflow sets PLAYWRIGHT_BASE_URL (its shared
// notion of the deployed target). Historically this script read ONLY
// SMOKE_BASE_URL / NEXT_PUBLIC_APP_URL and fell back to localhost, so a wired
// workflow with a configured target silently hit localhost:3000 on the runner
// instead of the deployment. Honor PLAYWRIGHT_BASE_URL too, and never silently
// fall back to localhost when a target was explicitly supplied.
const cli = process.argv[2];
const fromEnv =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.SMOKE_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL;
const baseUrl = cli ?? fromEnv;

if (!baseUrl) {
  console.error(
    "smoke-deployment: no target. Pass a URL as argv[1], or set PLAYWRIGHT_BASE_URL / SMOKE_BASE_URL / NEXT_PUBLIC_APP_URL. Refusing to default to localhost."
  );
  process.exit(2);
}
const normalized = baseUrl.replace(/\/$/, "");

async function check(path: string) {
  const started = Date.now();
  const token = process.env.HEALTH_TOKEN?.trim();
  const res = await fetch(`${normalized}${path}`, {
    headers: {
      accept: "application/json",
      ...(token ? { "x-health-token": token } : {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  const latencyMs = Date.now() - started;
  const ok = res.ok;
  console.log(`${ok ? "✅" : "❌"} ${path} ${res.status} ${latencyMs}ms`);
  if (!ok) console.log(JSON.stringify(body, null, 2));
  return ok;
}

async function main() {
  const results = await Promise.all([
    check("/api/health"),
    check("/api/health/dependencies"),
  ]);

  if (!results.every(Boolean)) {
    console.error(`Smoke check failed for ${normalized}`);
    process.exit(1);
  }

  console.log(`Deployment smoke check passed for ${normalized}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

export {};
